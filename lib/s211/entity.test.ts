import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateS211Entity, metConditionsSentence, S211_THRESHOLDS, S211_ENTITY_CITATION, S211_LOOKBACK_NOT_RUN, S211_NOT_MODELLED, type S211EntityInput, type S211YearFigures } from './entity'
import { THRESHOLD_TESTS } from '../deals/assessment'
import { ECB_UNITS_PER_EUR } from '../fx'

const cad = (assets: number | null, revenue: number | null, averageEmployees: number | null): S211YearFigures => ({ assets, revenue, averageEmployees, currency: 'CAD' })
const BIG = cad(25e6, 45e6, 300)          // 3 of 3
const TWO = cad(25e6, 45e6, 100)          // 2 of 3
const ONE = cad(25e6, 10e6, 100)          // 1 of 3
const NONE = cad(1e6, 1e6, 10)            // 0 of 3
const base: S211EntityInput = {
  listedInCanada: false, placeOfBusinessInCanada: true, doesBusinessInCanada: null, hasAssetsInCanada: null,
  mostRecentYear: NONE, priorYear: NONE,
}
const run = (over: Partial<S211EntityInput>) => evaluateS211Entity({ ...base, ...over })

describe('listed on a stock exchange in Canada', () => {
  it('is an entity at any size, with no Canadian place of business and no figures at all', () => {
    const r = run({ listedInCanada: true, placeOfBusinessInCanada: false, doesBusinessInCanada: false, hasAssetsInCanada: false, mostRecentYear: null, priorYear: null })
    expect(r.outcome).toBe('entity')
    expect(r.route).toBe('listed')
    expect(r.reasons[0]).toBe('Listed on a stock exchange in Canada, which makes it an entity at any size.')
  })

  it('is an entity even when both years fail every size condition', () => {
    expect(run({ listedInCanada: true })).toMatchObject({ outcome: 'entity', route: 'listed' })
  })
})

describe('the size route: a Canada nexus and 2 of 3 in either of the two most recent years', () => {
  it('2 of 3 met in the PRIOR year only: an entity, and the prior year is named', () => {
    const r = run({ mostRecentYear: ONE, priorYear: TWO })
    expect(r).toMatchObject({ outcome: 'entity', route: 'size', lookbackRun: true })
    expect(r.years.map(y => [y.year, y.metCount, y.met])).toEqual([['most-recent', 1, false], ['prior', 2, true]])
    // The conditions met are named, with the figures (review item C10).
    expect(r.reasons).toContain('Assets of CAD 25,000,000 (at least CAD 20 million) and revenue of CAD 45,000,000 (at least CAD 40 million) in the prior financial year.')
  })

  it('2 of 3 met in the most recent year only: an entity', () => {
    expect(run({ mostRecentYear: TWO, priorYear: NONE })).toMatchObject({ outcome: 'entity', route: 'size' })
  })

  it('1 of 3 in BOTH years: not an entity', () => {
    const r = run({ mostRecentYear: ONE, priorYear: ONE })
    expect(r).toMatchObject({ outcome: 'not-entity', route: null, lookbackRun: true })
    expect(r.reasons).toEqual([
      'Not listed on a stock exchange in Canada.',
      'Has a place of business in Canada, does business in Canada or has assets in Canada.',
      'Meets 1 of the 3 size conditions in the most recent financial year, fewer than the 2 required. Meets 1 of the 3 size conditions in the prior financial year, fewer than the 2 required.',
      S211_NOT_MODELLED,
    ])
  })

  it('a different 1 of 3 in each year is still not an entity: the two must be met in the SAME year', () => {
    expect(run({ mostRecentYear: cad(25e6, 1e6, 10), priorYear: cad(1e6, 45e6, 10) }).outcome).toBe('not-entity')
  })

  it('"at least": a figure equal to a threshold meets it, one unit below does not', () => {
    const at = cad(S211_THRESHOLDS.assetsCad, S211_THRESHOLDS.revenueCad, 1)
    const under = cad(S211_THRESHOLDS.assetsCad - 1, S211_THRESHOLDS.revenueCad, 1)
    expect(run({ mostRecentYear: at, priorYear: NONE }).outcome).toBe('entity')
    expect(run({ mostRecentYear: under, priorYear: NONE }).outcome).toBe('not-entity')
    expect(run({ mostRecentYear: cad(1, 1, 250), priorYear: NONE }).years[0].limbs[2].met).toBe(true)
    expect(run({ mostRecentYear: cad(1, 1, 249.9), priorYear: NONE }).years[0].limbs[2].met).toBe(false)
  })

  it('any one of place of business, doing business or assets in Canada is the nexus', () => {
    for (const nexus of [
      { placeOfBusinessInCanada: true, doesBusinessInCanada: false, hasAssetsInCanada: false },
      { placeOfBusinessInCanada: false, doesBusinessInCanada: true, hasAssetsInCanada: false },
      { placeOfBusinessInCanada: false, doesBusinessInCanada: false, hasAssetsInCanada: true },
    ]) expect(run({ ...nexus, mostRecentYear: BIG }).outcome).toBe('entity')
  })

  it('no Canada nexus and not listed: not an entity, however large', () => {
    const r = run({ placeOfBusinessInCanada: false, doesBusinessInCanada: false, hasAssetsInCanada: false, mostRecentYear: BIG, priorYear: BIG })
    expect(r.outcome).toBe('not-entity')
    expect(r.canadaNexus).toBe(false)
  })
})

describe('figures in another currency are converted to CAD at the dated ECB rates', () => {
  const { CAD, USD, JPY } = ECB_UNITS_PER_EUR
  it('USD: 15m of assets is CAD 21.3m and meets the CAD 20m condition; 14m does not', () => {
    const r = run({ mostRecentYear: { assets: 15e6, revenue: 29e6, averageEmployees: 10, currency: 'USD' }, priorYear: NONE })
    expect(r.years[0].limbs[0].value).toBeCloseTo((15e6 * CAD) / USD, 4)
    expect(r.years[0].limbs[0].value).toBeGreaterThan(21.3e6)
    expect(r.years[0].limbs[0]).toMatchObject({ met: true, note: 'Converted from USD at the ECB reference rate of 2026-07-01.' })
    // USD 29m of revenue is CAD 41.2m: the second condition, so an entity.
    expect(r.years[0].limbs[1].met).toBe(true)
    expect(r.outcome).toBe('entity')
    expect(run({ mostRecentYear: { assets: 14e6, revenue: 28e6, averageEmployees: 10, currency: 'USD' }, priorYear: NONE }).outcome).toBe('not-entity')
  })

  it('JPY: 5bn of revenue is CAD 43.7m; the same number read as CAD would be 125 times the threshold', () => {
    const r = run({ mostRecentYear: { assets: 1e9, revenue: 5e9, averageEmployees: 300, currency: 'JPY' }, priorYear: NONE })
    expect(r.years[0].limbs[1].value).toBeCloseTo((5e9 * CAD) / JPY, 2)
    expect(r.years[0].limbs.map(l => l.met)).toEqual([false, true, true])   // assets CAD 8.7m, revenue CAD 43.7m, 300
    expect(r.outcome).toBe('entity')
  })

  it('CAD figures are not converted and carry no note', () => {
    expect(run({ mostRecentYear: BIG }).years[0].limbs[0]).toEqual({ measure: 'assets', value: 25e6, threshold: 20e6, met: true, note: null, entered: 25e6, currency: 'CAD' })
  })

  it('a currency with no rate: the money conditions are not compared, and the outcome is not guessed', () => {
    const r = run({ mostRecentYear: { assets: 9e12, revenue: 9e12, averageEmployees: 300, currency: 'VND' }, priorYear: NONE })
    expect(r.years[0].limbs[0]).toMatchObject({ value: null, met: null, note: 'Not compared: no reference rate for VND.' })
    expect(r.years[0]).toMatchObject({ metCount: 1, unknownCount: 2, met: null })
    expect(r.outcome).toBe('undetermined')
  })

  it('the two years may be in different currencies', () => {
    const r = run({ mostRecentYear: { assets: 15e6, revenue: 29e6, averageEmployees: 1, currency: 'USD' }, priorYear: cad(1, 1, 1) })
    expect(r.outcome).toBe('entity')
  })
})

describe('one year only', () => {
  it('that year is tested; failing it is NOT a finding that it is not an entity, and the lookback is named as not run', () => {
    const r = run({ mostRecentYear: ONE, priorYear: null })
    expect(r).toMatchObject({ outcome: 'undetermined', lookbackRun: false })
    expect(r.years).toHaveLength(1)
    expect(r.years[0]).toMatchObject({ year: 'most-recent', metCount: 1, met: false })
    expect(r.reasons).toContain(S211_LOOKBACK_NOT_RUN)
    expect(S211_LOOKBACK_NOT_RUN).toBe('The Act tests either of the two most recent financial years. Figures for one year only were provided, so the lookback was not run.')
  })

  it('that year meeting 2 of 3 is enough: an entity, still saying the lookback was not run', () => {
    const r = run({ mostRecentYear: TWO, priorYear: null })
    expect(r).toMatchObject({ outcome: 'entity', route: 'size', lookbackRun: false })
    expect(r.reasons).toContain(S211_LOOKBACK_NOT_RUN)
  })

  it('only the prior year provided is treated the same way', () => {
    expect(run({ mostRecentYear: null, priorYear: ONE })).toMatchObject({ outcome: 'undetermined', lookbackRun: false })
  })

  it('no figures at all: undetermined, and it says the size conditions were not tested', () => {
    const r = run({ mostRecentYear: null, priorYear: null })
    expect(r.outcome).toBe('undetermined')
    expect(r.reasons).toContain('No financial-year figures were provided, so the size conditions were not tested.')
  })
})

describe('what is not answered is not decided', () => {
  it('a missing figure that could still make 2 of 3 leaves the year unsettled', () => {
    const r = run({ mostRecentYear: cad(25e6, null, 100), priorYear: NONE })
    expect(r.years[0]).toMatchObject({ metCount: 1, unknownCount: 1, met: null })
    expect(r.outcome).toBe('undetermined')
  })

  it('a missing figure that cannot change the result does not: 2 met and 1 missing is met, 0 met and 1 missing is not', () => {
    expect(run({ mostRecentYear: cad(25e6, 45e6, null) }).outcome).toBe('entity')
    expect(run({ mostRecentYear: cad(1, 1, null), priorYear: NONE }).outcome).toBe('not-entity')
  })

  it('the listing question unanswered: the size route can still establish an entity, but cannot rule one out', () => {
    expect(run({ listedInCanada: null, mostRecentYear: BIG }).outcome).toBe('entity')
    const r = run({ listedInCanada: null })
    expect(r.outcome).toBe('undetermined')
    expect(r.reasons[0]).toBe('Whether it is listed on a stock exchange in Canada was not answered.')
  })

  it('the Canada questions unanswered with the size conditions met: undetermined', () => {
    const r = run({ placeOfBusinessInCanada: null, doesBusinessInCanada: null, hasAssetsInCanada: null, mostRecentYear: BIG })
    expect(r).toMatchObject({ outcome: 'undetermined', canadaNexus: null })
  })

  it('every result says the prescribed-by-regulations route is not assessed', () => {
    for (const r of [run({}), run({ listedInCanada: true }), run({ mostRecentYear: BIG }), run({ priorYear: null })])
      expect(r.reasons[r.reasons.length - 1]).toBe(S211_NOT_MODELLED)
  })
})

describe('the Deals engine reads the same thresholds', () => {
  const t = THRESHOLD_TESTS['Canada S-211']
  it('its three limbs, its 2-of-3 and its citation come from this file', () => {
    expect(t.limbs.map(l => l.amount)).toEqual([S211_THRESHOLDS.assetsCad, S211_THRESHOLDS.revenueCad, S211_THRESHOLDS.averageEmployees])
    expect(t.limbs.map(l => l.amount)).toEqual([20_000_000, 40_000_000, 250])
    expect(t.requires).toBe(2)
    expect(t.citation).toBe(S211_ENTITY_CITATION)
    expect(t.citation).toBe('Fighting Against Forced Labour and Child Labour in Supply Chains Act (S-211), s.2 "entity"')
  })

  it('the engine imports them, and no threshold figure is retyped in it', () => {
    const src = readFileSync(join(process.cwd(), 'lib/deals/assessment.ts'), 'utf8')
    expect(src).toContain("import { S211_THRESHOLDS, S211_ENTITY_CITATION } from '../s211/entity'")
    const block = src.slice(src.indexOf("'Canada S-211': {"), src.indexOf("'Canada S-211': {") + 2600)
    expect(block).not.toMatch(/amount: (20_000_000|40_000_000|250),/)
  })

  it('this file does not import the Deals engine', () => {
    const imports = readFileSync(join(process.cwd(), 'lib/s211/entity.ts'), 'utf8').split('\n').filter(l => l.startsWith('import '))
    expect(imports).toEqual(["import { FX_AS_OF, isFxCurrency, convertFx } from '../fx'"])
  })
})

describe('the conditions met, named with their figures', () => {
  it('all three, in CAD: each figure, its threshold, and the year', () => {
    const r = run({ mostRecentYear: BIG, priorYear: NONE })
    expect(metConditionsSentence(r.years[0])).toBe(
      'Assets of CAD 25,000,000 (at least CAD 20 million), revenue of CAD 45,000,000 (at least CAD 40 million) and an average of 300 employees (at least 250) in the most recent financial year.')
  })

  it('a figure equal to the threshold meets it, so the sentence says "at least", never "over"', () => {
    const r = run({ mostRecentYear: cad(20e6, 40e6, 10), priorYear: NONE })
    expect(r.outcome).toBe('entity')
    const s = metConditionsSentence(r.years[0])
    expect(s).toBe('Assets of CAD 20,000,000 (at least CAD 20 million) and revenue of CAD 40,000,000 (at least CAD 40 million) in the most recent financial year.')
    expect(s).not.toMatch(/\bover\b/)
  })

  it('a converted figure shows the amount entered, then the CAD value it was compared as', () => {
    const r = run({ mostRecentYear: { assets: 15e6, revenue: 29e6, averageEmployees: 10, currency: 'USD' }, priorYear: NONE })
    expect(metConditionsSentence(r.years[0])).toMatch(/^Assets of USD 15,000,000 \(CAD [\d,]+, at least CAD 20 million\) and revenue of USD 29,000,000 \(CAD [\d,]+, at least CAD 40 million\) in the most recent financial year\.$/)
  })

  it('the entity reasons carry the figures sentence for the year relied on', () => {
    const r = run({ mostRecentYear: TWO, priorYear: NONE })
    expect(r.reasons).toContain('Assets of CAD 25,000,000 (at least CAD 20 million) and revenue of CAD 45,000,000 (at least CAD 40 million) in the most recent financial year.')
  })
})
