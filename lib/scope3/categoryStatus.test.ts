import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  it('S9 ⚠️ a method\'s own data-quality score rides with the figure, and only with a figure', () => {
    // PCAF's 1-5 scale for Cat 15. It is the METHOD's number, not ThemisIQ's confidence pill.
    expect(coverageEntry(scope3Status(true, true), { mt: 10_000, unpriced: false, reason: null, dq: 1.58 }))
      .toEqual({ status: 'relevant_calculated', mt: 10_000, in_total: true, unpriced: false, reason: null, dq: 1.58 })
    // No figure, no score: a quality claim about something never calculated.
    expect(coverageEntry(scope3Status(true, false), { mt: null, unpriced: false, reason: null, dq: 5 }))
      .not.toHaveProperty('dq')
    // An excluded category that WAS calculated keeps its score, because it still reports its figure.
    expect(coverageEntry(scope3Status(false, true), { mt: 3, unpriced: false, reason: null, dq: 2 }).dq).toBe(2)
    // ⚠️ OMITTED, NOT NULL, for the fourteen categories whose methods define no such scale — a column of
    // nulls beside PCAF scores reads as a comparable number across methods, and it is not one.
    expect(coverageEntry(scope3Status(true, true), { mt: 12, unpriced: false, reason: null })).not.toHaveProperty('dq')
    expect(coverageEntry(scope3Status(true, true), { mt: 12, unpriced: false, reason: null, dq: null })).not.toHaveProperty('dq')
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

// ── THE EXCLUSION JUSTIFICATION, AND THE GATE ON THE KEY SET ────────────────────────────────────
//
// GHG Protocol chapter 11.1 obliges a report to list the categories excluded WITH justification of their
// exclusion. Until 25 Sep 2026 the justification lived only in cat_data, which get_verifier_scope3
// withholds wholesale, so a verifier received the exclusions and the count of unjustified ones and not one
// justification.

describe('the exclusion justification on a coverage entry', () => {
  const excluded = scope3Status(false, false)
  const excludedCalculated = scope3Status(false, true)

  it('carries the customer prose verbatim, untouched', () => {
    const e = coverageEntry(excluded, { mt: null, unpriced: false, reason: null, excludedReason: 'No leased assets in the reporting year.' })
    expect(e.excluded_reason).toBe('No leased assets in the reporting year.')
  })

  it('is null when blank, and never a fallback string', () => {
    // ⚠️ 'No justification recorded' IS OUR SENTENCE AND BELONGS AT THE RENDER. A field holding either the
    // customer's words or ours, with nothing to tell them apart, is the data_quality defect one field over:
    // it substitutes 'Supplier-reported (basis unspecified)' into a field that otherwise holds the
    // supplier's own words, and that ambiguity is frozen into every snapshot already written.
    for (const blank of ['', '   ', '\n', undefined, null]) {
      const e = coverageEntry(excluded, { mt: null, unpriced: false, reason: null, excludedReason: blank })
      expect(e.excluded_reason, `blank: ${JSON.stringify(blank)}`).toBeNull()
      expect(e).toHaveProperty('excluded_reason')
    }
  })

  it('trims, because whitespace is not a justification', () => {
    expect(coverageEntry(excluded, { mt: null, unpriced: false, reason: null, excludedReason: '  no such activity  ' }).excluded_reason)
      .toBe('no such activity')
  })

  it('appears only for an answered exclusion, and is absent rather than null elsewhere', () => {
    // The dq precedent: omission is the type's way of saying the question does not apply. The three states
    // are then readable from the entry alone, without cross-referencing status.
    for (const st of [scope3Status(true, true), scope3Status(true, false), scope3Status(null, false), scope3Status(null, true)]) {
      const e = coverageEntry(st, { mt: null, unpriced: false, reason: null, excludedReason: 'should not survive' })
      expect(e, `${st.key} must not carry a justification`).not.toHaveProperty('excluded_reason')
    }
    expect(coverageEntry(excluded, { mt: null, unpriced: false, reason: null })).toHaveProperty('excluded_reason')
    expect(coverageEntry(excludedCalculated, { mt: 3, unpriced: false, reason: null })).toHaveProperty('excluded_reason')
  })

  it('rides beside the figure that justifies the exclusion', () => {
    // ⚠️ not_relevant_calculated IS THE INTERESTING CASE, and it is correct under 11.1: a customer who
    // calculated a category, found it immaterial and excluded it on that basis has BOTH a figure and an
    // exclusion, and the figure is the evidence for the exclusion. The entry carries both, and the
    // verifier page has to say why a number appears beside a category the company excluded.
    const e = coverageEntry(excludedCalculated, { mt: 3.25, unpriced: false, reason: null, excludedReason: 'Under 1% of the inventory.' })
    expect(e.mt).toBe(3.25)
    expect(e.in_total).toBe(false)
    expect(e.excluded_reason).toBe('Under 1% of the inventory.')
  })

  it('is written by the calculator, not left to a future caller', () => {
    const page = readFileSync(join(__dirname, '..', '..', 'app', 'dashboard', 'scope3', 'page.tsx'), 'utf8')
    const code = page.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    expect(code, 'scope3Coverage must pass the stored justification into coverageEntry')
      .toContain("excludedReason: catData[c.id]?.excluded_reason")
  })
})

describe('the coverage key set is a disclosure boundary', () => {
  it('has exactly these keys, because get_verifier_scope3 projects the map WHOLESALE', () => {
    // ⚠️ THIS IS A GATE, NOT AN INVENTORY. get_verifier_scope3 rebuilds `lines`, `uncovered` and
    // `currency_flags` key by key precisely so a field added to a snapshot is NOT disclosed until it is
    // named in the RPC. scope3_coverage gets none of that: the RPC projects
    // `'scope3_coverage', s.scope3_coverage` as a whole column, so EVERY KEY ADDED HERE REACHES AN
    // EXTERNAL VERIFIER THE MOMENT IT IS WRITTEN, with no review step anywhere.
    //   That is portal_get's lesson one level down. There the June review asked which ROWS a definer
    // function could reach and answered correctly, and nobody asked which COLUMNS. Here the column is
    // whitelisted and the keys inside it are not.
    //   Wholesale projection is the right behaviour: all seven keys are designed for exactly this reader.
    // But it must be a decision rather than an accident, so adding a key means editing this list, and
    // editing this list means reading this comment.
    const all = coverageEntry(scope3Status(false, true), {
      mt: 1, unpriced: false, reason: null, dq: 2, excludedReason: 'x',
    })
    const unpricedEntry = coverageEntry(scope3Status(true, false), {
      mt: null, unpriced: true, reason: 'No factor is held for the sector selected.',
    })
    const keys = [...new Set([...Object.keys(all), ...Object.keys(unpricedEntry)])].sort()
    expect(keys, 'A KEY ADDED HERE IS DISCLOSED WHOLESALE TO AN EXTERNAL VERIFIER by ' +
      'get_verifier_scope3, which projects scope3_coverage as a whole column and whitelists nothing ' +
      'inside it. Confirm the new key is fit for that reader, then add it here and to the column comment ' +
      '(the 20260917 chain).').toEqual(
      ['dq', 'excluded_reason', 'in_total', 'mt', 'reason', 'status', 'unpriced'],
    )
  })
})
