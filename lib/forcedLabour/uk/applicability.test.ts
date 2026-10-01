import { describe, it, expect } from 'vitest'
import { evaluateUkApplicability, turnoverEstimate, cleanUkApplicability, UK_QUOTED, UK_OUTCOME_LABEL, ESTIMATE_CAVEAT, type UkApplicabilityForm } from './applicability'
import { UK_MSA_S54_2, UK_REGS_2, UK_GUIDANCE_DETERMINE } from './requirements'
import { FX_AS_OF } from '../../fx'

const full = (over: Partial<UkApplicabilityForm> = {}): UkApplicabilityForm =>
  ({ org_form: 'body_corporate', uk_business: 'yes', supplies: 'yes', turnover_gbp: '40000000', turnover_basis: 'confirmed', ...over })

describe('the £36 million boundary (s.54(2)(b), reg. 2: "not less than")', () => {
  it('exactly £36,000,000 is in scope; a penny less is not', () => {
    expect(evaluateUkApplicability(full({ turnover_gbp: '36000000' })).outcome).toBe('required')
    expect(evaluateUkApplicability(full({ turnover_gbp: '35999999.99' })).outcome).toBe('not-required')
    expect(UK_REGS_2).toContain('£36 million')
    expect(UK_MSA_S54_2.paragraphs[1].text).toContain('not less than')
  })
})

describe('the kind of organisation (s.54(12))', () => {
  it('a body corporate and a partnership are both commercial organisations; neither is not', () => {
    expect(evaluateUkApplicability(full()).outcome).toBe('required')
    expect(evaluateUkApplicability(full({ org_form: 'partnership' })).outcome).toBe('required')
    const other = evaluateUkApplicability(full({ org_form: 'other' }))
    expect(other.outcome).toBe('not-required')
    expect(other.reasons[0]).toContain('neither a body corporate nor a partnership')
  })
  it('no UK business, or no goods or services, settles it whatever else is unanswered', () => {
    expect(evaluateUkApplicability({ uk_business: 'no' }).outcome).toBe('not-required')
    expect(evaluateUkApplicability({ supplies: 'no' }).outcome).toBe('not-required')
  })
})

describe('unanswered questions', () => {
  it('give "Not yet determined", and say what is still to answer', () => {
    const r = evaluateUkApplicability({})
    expect(r.outcome).toBe('undetermined')
    expect(UK_OUTCOME_LABEL[r.outcome]).toBe('Not yet determined')
    expect(r.unanswered).toHaveLength(4)
    expect(evaluateUkApplicability(full({ supplies: '' })).outcome).toBe('undetermined')
  })
  it('a turnover below the threshold settles it even with other questions open', () => {
    expect(evaluateUkApplicability({ turnover_gbp: '1000', turnover_basis: 'confirmed' }).outcome).toBe('not-required')
  })
})

describe('an estimate against a confirmed figure', () => {
  it('a verdict that turns on the estimate says so; confirming it makes it definite', () => {
    const est = evaluateUkApplicability(full({ turnover_basis: 'estimate' }))
    expect(est.outcome).toBe('required')
    expect(est.restsOnEstimate).toBe(true)
    expect(evaluateUkApplicability(full({ turnover_basis: 'confirmed' })).restsOnEstimate).toBe(false)
    expect(evaluateUkApplicability(full({ turnover_basis: 'estimate', turnover_gbp: '100' })).restsOnEstimate).toBe(true)
    expect(ESTIMATE_CAVEAT).toContain('estimated turnover')
  })
  it('a verdict that does not turn on turnover does not rest on the estimate', () => {
    expect(evaluateUkApplicability(full({ org_form: 'other', turnover_basis: 'estimate' })).restsOnEstimate).toBe(false)
  })
  it('the estimate converts at the dated ECB rate, and is null with no rate for the currency', () => {
    const e = turnoverEstimate(50_000_000, 'CAD')!
    expect(e.turnover_basis).toBe('estimate')
    expect(e.estimate_rate_date).toBe(FX_AS_OF)
    expect(Number(e.turnover_gbp)).toBeGreaterThan(20_000_000)
    expect(turnoverEstimate(50_000_000, 'GBP')!.turnover_gbp).toBe('50000000')
    expect(turnoverEstimate(50_000_000, 'XYZ')).toBeNull()
    expect(turnoverEstimate(null, 'CAD')).toBeNull()
  })
})

describe('the stored record and the quotations', () => {
  it('accepts only the known keys and values', () => {
    expect(cleanUkApplicability(full())).toEqual(full())
    expect(cleanUkApplicability({ org_form: 'company' })).toBeNull()
    expect(cleanUkApplicability({ turnover_gbp: '36m' })).toBeNull()
    expect(cleanUkApplicability([])).toBeNull()
  })
  it('quotes the Act, the regulations and the guidance from the constants', () => {
    expect(UK_QUOTED.supplies).toBe('supplies goods or services')
    expect(UK_QUOTED.threshold).toBe(UK_REGS_2)
    expect(UK_GUIDANCE_DETERMINE).toContain('Organisations are responsible for determining')
  })
})
