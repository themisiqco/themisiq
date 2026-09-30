import { describe, it, expect } from 'vitest'
import {
  evaluateS211Obligation, S211_OUTCOME_LABEL, S211_SELL_DISTRIBUTE_REASON, S211_NOT_AN_ENTITY_REASON, S211_NO_ACTIVITY_REASON,
  S211_ENTITY_UNSETTLED_REASON, S211_ENFORCEMENT_COMMITMENT_WITHDRAWN, S211_ACT_9A_QUOTED, type S211Activities,
} from './obligation'
import { evaluateS211Entity } from './entity'
import {
  S211_ACT_SECTION_9, S211_GUIDANCE_REPORTING_OBLIGATION, S211_GUIDANCE_SELL_DISTRIBUTE_ONLY, S211_GUIDANCE_VERY_MINOR_DEALINGS,
  S211_GUIDANCE_PRIOR_NO_ENFORCEMENT, S211_GUIDANCE_PRIOR_NO_ENFORCEMENT_PAGE_DATES,
} from './requirements'

const NONE: S211Activities = { producesGoods: 'no', sellsGoods: 'no', distributesGoods: 'no', importsGoods: 'no', controlsEntityWithGoodsActivity: 'no' }
const ENTITY = { outcome: 'entity' } as const
const run = (over: Partial<S211Activities>, entity: { outcome: 'entity' | 'not-entity' | 'undetermined' } = ENTITY) => evaluateS211Obligation(entity, { ...NONE, ...over })

describe('the texts this rests on', () => {
  it('the Act, s.9: producing, selling or distributing; importing; controlling', () => {
    expect(S211_ACT_SECTION_9.leadIn).toBe('This Part applies to any entity')
    expect(S211_ACT_SECTION_9.paragraphs.map(p => `(${p.letter}) ${p.text}`)).toEqual([
      '(a) producing, selling or distributing goods in Canada or elsewhere;',
      '(b) importing into Canada goods produced outside Canada; or',
      '(c) controlling an entity engaged in any activity described in paragraph (a) or (b).',
    ])
  })

  it('the guidance is narrower: no selling or distributing in its list, and a sentence saying so', () => {
    expect([...S211_GUIDANCE_REPORTING_OBLIGATION.activities]).toEqual([
      'produce goods in Canada or elsewhere;', 'import goods produced outside Canada; or', 'control another entity that produces or imports goods.',
    ])
    expect(S211_GUIDANCE_SELL_DISTRIBUTE_ONLY).toBe('Entities solely involved in distributing and selling are not expected to report under the Act.')
  })

  it('the guidance on very minor dealings, three paragraphs, word for word', () => {
    expect([...S211_GUIDANCE_VERY_MINOR_DEALINGS]).toEqual([
      'There is no prescribed threshold for the minimum value of goods that an entity must produce or import to be subject to the reporting obligation. However, the terms as they are used in the Act should be understood as excluding "very minor dealings", which may be interpreted in accordance with generally accepted principles of de minimis and evaluated within the context of each entity\'s overall operations.',
      'If an entity\'s importing or producing activities are incidental, low-volume, or not central to its core business, they may qualify as very minor dealings.',
      'Entities should apply judgment based on the scale, frequency, and relevance of the activity within their broader operations.',
    ])
  })

  it('the four outcomes are named as asked', () => {
    expect(S211_OUTCOME_LABEL).toEqual({
      'must-report': 'Must report',
      within_act_not_expected: 'Not expected to report (within the Act, but covered by the guidance for selling and distributing only).',
      'does-not-have-to-report': 'Does not have to report',
      undetermined: 'Not yet determined',
    })
  })

  it('the enforcement sentence earlier versions of the guidance carried, and the versions it was in', () => {
    expect(S211_GUIDANCE_PRIOR_NO_ENFORCEMENT).toBe('Public Safety Canada will not seek enforcement action in those instances.')
    expect([...S211_GUIDANCE_PRIOR_NO_ENFORCEMENT_PAGE_DATES]).toEqual(['2024-11-15', '2025-07-30'])
    // The current sentence does not contain it.
    expect(S211_GUIDANCE_SELL_DISTRIBUTE_ONLY).not.toContain('enforcement')
  })
})

describe('each activity, for an entity', () => {
  it('produces goods: must report under s.9(a), with the very-minor-dealings guidance quoted', () => {
    const r = run({ producesGoods: 'yes' })
    expect(r).toMatchObject({ outcome: 'must-report', actParagraphs: ['a'], guidanceCaveat: null })
    expect(r.reasons).toEqual(['It meets the Act\u2019s definition of an entity (section 2).', 'It produces goods, which section 9(a) of the Act covers.'])
    expect(r.guidanceQuoted).toEqual([...S211_GUIDANCE_VERY_MINOR_DEALINGS])
  })

  it('imports goods: must report under s.9(b)', () => {
    const r = run({ importsGoods: 'yes' })
    expect(r).toMatchObject({ outcome: 'must-report', actParagraphs: ['b'], guidanceCaveat: null })
    expect(r.reasons[1]).toBe('It imports into Canada goods produced outside Canada, which section 9(b) of the Act covers.')
    expect(r.guidanceQuoted).toEqual([...S211_GUIDANCE_VERY_MINOR_DEALINGS])
  })

  it('the control route: controls an entity that does, and does none of it itself: must report under s.9(c)', () => {
    const r = run({ controlsEntityWithGoodsActivity: 'yes' })
    expect(r).toMatchObject({ outcome: 'must-report', actParagraphs: ['c'], guidanceCaveat: null })
    expect(r.reasons[1]).toBe('It controls an entity that produces, sells, distributes or imports goods, which section 9(c) of the Act covers.')
    // Very minor dealings is about the entity's OWN producing and importing, so it is not quoted here.
    expect(r.guidanceQuoted).toEqual([])
  })

  it('several at once: every paragraph that applies is named', () => {
    const r = run({ producesGoods: 'yes', sellsGoods: 'yes', importsGoods: 'yes', controlsEntityWithGoodsActivity: 'yes' })
    expect(r).toMatchObject({ outcome: 'must-report', actParagraphs: ['a', 'b', 'c'], guidanceCaveat: null })
    expect(r.reasons[1]).toContain('which section 9(a) and 9(b) and 9(c) of the Act covers.')
  })

  it('none of them: does not have to report, with the guidance sentence that says so', () => {
    const r = run({})
    expect(r).toMatchObject({ outcome: 'does-not-have-to-report', actParagraphs: [], guidanceCaveat: null })
    expect(r.reasons).toEqual([S211_NO_ACTIVITY_REASON])
    expect(r.guidanceQuoted).toEqual(['If an organization is not involved in any of the prescribed activities, then it does not need to report, even if it meets the definition of entity.'])
  })
})

describe('only sells and distributes', () => {
  for (const [name, over] of [
    ['sells only', { sellsGoods: 'yes' }], ['distributes only', { distributesGoods: 'yes' }], ['sells and distributes', { sellsGoods: 'yes', distributesGoods: 'yes' }],
  ] as const) {
    it(`${name}: WITHIN THE ACT, NOT EXPECTED TO REPORT: its own outcome, never "must report" and never a silent exemption`, () => {
      const r = run(over)
      expect(r.outcome).toBe('within_act_not_expected')
      expect(r.outcome).not.toBe('must-report')
      expect(r.outcome).not.toBe('does-not-have-to-report')
      expect(r.actParagraphs).toEqual(['a'])
      // s.9(a) and the guidance sentence, both verbatim.
      expect(r.actQuoted).toBe('This Part applies to any entity producing, selling or distributing goods in Canada or elsewhere;')
      // The note on earlier versions of the guidance is kept apart from the reasons, and shown after the
      // Act's words and the current guidance (review item C15).
      expect(r.reasons).not.toContain(S211_ENFORCEMENT_COMMITMENT_WITHDRAWN)
      expect(r.notes).toEqual([S211_ENFORCEMENT_COMMITMENT_WITHDRAWN])
      expect(r.guidanceCaveat).toBe('Entities solely involved in distributing and selling are not expected to report under the Act.')
      expect(r.guidanceQuoted).toEqual([S211_GUIDANCE_SELL_DISTRIBUTE_ONLY])
      expect(r.reasons).toContain(S211_SELL_DISTRIBUTE_REASON)
    })
  }

  it('the reason says the Act reaches it and that the guidance is not the statute', () => {
    expect(S211_SELL_DISTRIBUTE_REASON).toBe('Section 9(a) of the Act applies to an entity selling or distributing goods, so the entity falls within the Act. Public Safety Canada’s guidance takes a narrower position, quoted here; it is guidance and not the statute.')
  })

  it('the note on the withdrawn commitment: the earlier sentence quoted, the current page date, and that filing is the entity’s judgment', () => {
    expect(S211_ENFORCEMENT_COMMITMENT_WITHDRAWN).toBe('Earlier versions of the guidance added: "Public Safety Canada will not seek enforcement action in those instances." The current version, dated 2025-12-18, no longer says so. Whether to file voluntarily is therefore a judgment for the entity.')
    expect(S211_ACT_9A_QUOTED).toBe(`${S211_ACT_SECTION_9.leadIn} ${S211_ACT_SECTION_9.paragraphs[0].text}`)
  })

  it('sells, and also produces: MUST REPORT, and neither the caveat nor the Act quote is set, because it is not SOLELY selling', () => {
    expect(run({ sellsGoods: 'yes', producesGoods: 'yes' })).toMatchObject({ outcome: 'must-report', guidanceCaveat: null, actQuoted: null })
    expect(run({ distributesGoods: 'yes', importsGoods: 'yes' })).toMatchObject({ outcome: 'must-report', guidanceCaveat: null, actQuoted: null })
    expect(run({ sellsGoods: 'yes', controlsEntityWithGoodsActivity: 'yes' }).outcome).toBe('must-report')
  })

  it('sells, and not sure about producing: within the Act and not expected, caveat quoted, and "solely" is named as unsettled', () => {
    const r = run({ sellsGoods: 'yes', producesGoods: 'not-sure' })
    expect(r.outcome).toBe('within_act_not_expected')
    expect(r.guidanceCaveat).toBe(S211_GUIDANCE_SELL_DISTRIBUTE_ONLY)
    expect(r.reasons[r.reasons.length - 1]).toBe('Not sure whether it produces goods. The guidance’s position covers an entity that ONLY sells and distributes, which is not settled here.')
  })
})

describe('not sure', () => {
  it('one activity not sure and the rest no: undetermined, naming it', () => {
    const r = run({ importsGoods: 'not-sure' })
    expect(r.outcome).toBe('undetermined')
    expect(r.reasons).toEqual([
      'Not sure whether it imports into Canada goods produced outside Canada.',
      'No activity in section 9 of the Act was confirmed and not all were ruled out, so whether Part 2 applies is not settled.',
    ])
  })

  it('every activity not sure: undetermined, naming all five', () => {
    const r = run({ producesGoods: 'not-sure', sellsGoods: 'not-sure', distributesGoods: 'not-sure', importsGoods: 'not-sure', controlsEntityWithGoodsActivity: 'not-sure' })
    expect(r.outcome).toBe('undetermined')
    expect(r.reasons[0]).toBe('Not sure whether it produces goods, sells goods, distributes goods, imports into Canada goods produced outside Canada and controls an entity that produces, sells, distributes or imports goods.')
  })

  it('a confirmed activity is not undone by a "not sure" elsewhere', () => {
    const r = run({ producesGoods: 'yes', controlsEntityWithGoodsActivity: 'not-sure' })
    expect(r.outcome).toBe('must-report')
    expect(r.reasons).toContain('Not sure whether it controls an entity that produces, sells, distributes or imports goods.')
  })
})

describe('the entity test comes first', () => {
  it('not an entity: does not have to report, whatever it does with goods', () => {
    const r = run({ producesGoods: 'yes', importsGoods: 'yes' }, { outcome: 'not-entity' })
    expect(r.outcome).toBe('does-not-have-to-report')
    expect(r.reasons).toEqual([S211_NOT_AN_ENTITY_REASON])
  })

  it('entity not settled, with an activity confirmed: undetermined, and it says why', () => {
    const r = run({ producesGoods: 'yes' }, { outcome: 'undetermined' })
    expect(r.outcome).toBe('undetermined')
    expect(r.reasons).toEqual(['It produces goods, which section 9(a) of the Act covers.', S211_ENTITY_UNSETTLED_REASON])
  })

  it('entity not settled, and no activity at all: does not have to report, since s.9 is not met either way', () => {
    expect(run({}, { outcome: 'undetermined' }).outcome).toBe('does-not-have-to-report')
  })

  it('end to end: a listed company that imports must report; the same company with no goods activity does not', () => {
    const entity = evaluateS211Entity({ listedInCanada: true, placeOfBusinessInCanada: null, doesBusinessInCanada: null, hasAssetsInCanada: null, mostRecentYear: null, priorYear: null })
    expect(evaluateS211Obligation(entity, { ...NONE, importsGoods: 'yes' }).outcome).toBe('must-report')
    expect(evaluateS211Obligation(entity, NONE).outcome).toBe('does-not-have-to-report')
  })
})
