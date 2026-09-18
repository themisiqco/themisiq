import { describe, it, expect } from 'vitest'
import { scope3Status, scope3StatusLabel, relevanceFromStored, coverageEntry, type Relevance } from './categoryStatus'

describe('Scope 3 category status', () => {
  it('S1 the four labels compose from the pair', () => {
    expect(scope3StatusLabel(true, true)).toBe('Relevant, calculated')
    expect(scope3StatusLabel(true, false)).toBe('Relevant, not yet calculated')
    expect(scope3StatusLabel(false, true)).toBe('Not relevant, calculated')
    expect(scope3StatusLabel(false, false)).toBe('Not relevant, not calculated')
  })

  it('S2 an unanswered category is not evaluated, with or without a figure', () => {
    expect(scope3Status(null, false)).toMatchObject({ key: 'not_evaluated', label: 'Not evaluated', calculated: false })
    // Data does not answer the question. The figure is still carried, so a surface can show both.
    expect(scope3Status(null, true)).toMatchObject({ key: 'not_evaluated', calculated: true, reportFigure: true })
  })

  it('S3 ⚠️ only a relevant, calculated category is in the total', () => {
    const inTotal = ([true, false, null] as Relevance[])
      .flatMap(r => [true, false].map(c => [r, c, scope3Status(r, c).inTotal] as const))
      .filter(([, , t]) => t)
    expect(inTotal).toEqual([[true, true, true]])
  })

  it('S4 ⚠️ an excluded category that was calculated reports its figure and is out of the total', () => {
    // The state a customer reaches by calculating a category, finding it small, and excluding it on that
    // basis. The figure is the evidence for the exclusion, so it is reported; the total is the claim, so
    // it does not include it.
    const s = scope3Status(false, true)
    expect(s).toMatchObject({ key: 'not_relevant_calculated', inTotal: false, reportFigure: true, requiresExplanation: true })
  })

  it('S5 only an answered exclusion requires an explanation', () => {
    expect(scope3Status(false, false).requiresExplanation).toBe(true)
    expect(scope3Status(false, true).requiresExplanation).toBe(true)
    expect(scope3Status(true, false).requiresExplanation).toBe(false)
    expect(scope3Status(null, false).requiresExplanation).toBe(false)
  })

  it('S6 stored records map: relevant wins, then the retired included, then not evaluated', () => {
    expect(relevanceFromStored({ relevant: true, included: false })).toBe(true)
    expect(relevanceFromStored({ relevant: null, included: true })).toBeNull()
    expect(relevanceFromStored({ included: true })).toBe(true)
    // An old deselection migrates as the exclusion the page always displayed it as, not as unanswered.
    expect(relevanceFromStored({ included: false })).toBe(false)
    expect(relevanceFromStored({})).toBeNull()
    expect(relevanceFromStored(undefined)).toBeNull()
  })

  it('S7 ⚠️ unpriced is a property of the entry, and the CDP label is unchanged by it', () => {
    const st = scope3Status(true, false)
    const e = coverageEntry(st, { mt: null, unpriced: true, reason: 'No factor is held for the sector selected.' })
    expect(e).toEqual({
      status: 'relevant_not_calculated',
      mt: null,
      in_total: false,
      unpriced: true,
      reason: 'No factor is held for the sector selected.',
    })
    // The status key — and therefore the label a CDP submission reads — is the same either way.
    expect(scope3StatusLabel(true, false)).toBe('Relevant, not yet calculated')
  })

  it('S8 the invariants hold: a calculated entry is never unpriced, and only an unpriced one carries a reason', () => {
    const calculated = coverageEntry(scope3Status(true, true), { mt: 12.5, unpriced: true, reason: 'should not survive' })
    expect(calculated).toMatchObject({ unpriced: false, reason: null, mt: 12.5, in_total: true })
    const waiting = coverageEntry(scope3Status(true, false), { mt: null, unpriced: false, reason: 'should not survive' })
    expect(waiting.reason).toBeNull()
    // An excluded category that was calculated: figure kept, out of the total.
    expect(coverageEntry(scope3Status(false, true), { mt: 3, unpriced: false, reason: null }))
      .toMatchObject({ status: 'not_relevant_calculated', mt: 3, in_total: false })
    // mt is dropped wherever nothing was calculated, so a stale figure cannot ride along.
    expect(coverageEntry(scope3Status(null, false), { mt: 9, unpriced: false, reason: null }).mt).toBeNull()
  })
})
