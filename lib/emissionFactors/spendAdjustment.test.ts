import { describe, it, expect } from 'vitest'
import {
  convertSpendToFactorBasis,
  assertSingleFactorBasisConversion,
  type EditionConversionInput,
  type SpendConversionRow,
  type SpendAdjustment,
} from './spendAdjustment'
import { resolveSpendFactor } from './spendResolver.server'
import type { SpendFactorQuery } from './spend'

// EDITION CONVERSION IS THE ONE TRANSFORMATION THIS MODULE FAMILY PERFORMS RATHER THAN REPORTS.
//
// Everything else — the price basis, a factor's position in the intensity distribution, a substituted region — is flagged and
// handed back. This one is applied, and it is applied because the EDITION supplies the scalar: the
// authority is a fingerprinted artefact, the numbers are recorded, and the factor is untouched.
// These tests are mostly about that last clause. A conversion that quietly moved the factor, or
// that returned the unconverted amount when the scalar was unusable, would produce a figure that
// looks converted and is not.
//
// THE SCALARS BELOW ARE REAL, taken from lib/emissionFactors/spendConversions.json, edition
// exiobase-3.8.2-2019-cpi2024-spendconv. They are copied in rather than imported so that a test
// failure says which number moved, rather than silently tracking a regenerated artefact.

const EDITION = 'exiobase-3.8.2-2019-cpi2024-spendconv'

/** DE/EUR. Equals 1 / German cpi_ratio, both euro FX legs cancelling. */
const DE_EUR: SpendConversionRow = {
  edition_id: EDITION,
  to_eur2019_per_unit: 0.8367765223463683,
  basis: 'published',
  gdp_coverage_pct: null,
}

/** WF/USD — a rest-of-world composite, carrying its coverage. */
const WF_USD: SpendConversionRow = {
  edition_id: EDITION,
  to_eur2019_per_unit: 0.9982178265714696,
  basis: 'row_composite',
  gdp_coverage_pct: 90.6,
}

/** p28 "Fabricated metal products, except machinery and equipment (28)", region DE, as published in
 *  exiobaseFactors2019pxp.json: kg CO2 eq. per MILLION EUR at 2019 basic prices. Validated against
 *  Climatiq's Procurement API figure to 0.0094%. */
const PUBLISHED_P28_DE = 256624.197323

const base = (over: Partial<EditionConversionInput> = {}): EditionConversionInput => ({
  amount: 100_000,
  currency: 'EUR',
  region_code: 'DE',
  conversion: DE_EUR,
  ...over,
})

describe('convertSpendToFactorBasis', () => {
  it('C1 a vintage-year spend converts DOWNWARD where prices rose', () => {
    // German prices rose 19.5% between 2019 and 2024, so 100,000 of 2024 euros is fewer 2019 euros.
    const a = convertSpendToFactorBasis(base())
    expect(a.multiplier).toBe(0.8367765223463683)
    expect(a.output_amount).toBeCloseTo(83_677.65223463683, 6)
    expect(a.output_amount, 'five years of inflation must not read as emissions growth')
      .toBeLessThan(a.input_amount)
  })

  it('C2 three numbers a verifier can check, and they agree with each other', () => {
    const a = convertSpendToFactorBasis(base())
    expect(a.input_amount).toBe(100_000)
    expect(a.output_amount, 'output must equal input x multiplier, not a re-derivation')
      .toBeCloseTo(a.input_amount * a.multiplier, 9)
    expect(a.multiplier, 'the multiplier IS the stored scalar, not a derivation of it')
      .toBe(a.to_eur2019_per_unit)
    expect(a.kind).toBe('edition_conversion')
    expect(a.edition_id).toBe(EDITION)
    expect(a.region_code).toBe('DE')
    expect(a.currency).toBe('EUR')
  })

  it('C3 the factor value is never modified, and the record says so', () => {
    const q: SpendFactorQuery = {
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'EUR', reporting_year: 2026, spend_price_basis: 'basic',
    }
    const before = resolveSpendFactor(q)
    if (!before || before.kind === 'absent') throw new Error('expected a factor')
    const value = before.factor.value

    convertSpendToFactorBasis(base())

    const after = resolveSpendFactor(q)
    if (!after || after.kind === 'absent') throw new Error('expected a factor')
    expect(after.factor.value, 'conversion moved the spend, not the factor').toBe(value)
    expect(after.factor.value).toBeCloseTo(1.81385091108, 9)
    expect(convertSpendToFactorBasis(base()).factor_value_modified).toBe(false)
  })

  it('C4 the edition travels, and the disclosure says what was DONE, not what remains', () => {
    const a = convertSpendToFactorBasis(base())
    expect(a.disclosure).toContain(EDITION)
    // The region by name with its code, not "DE/EUR": the sentence is customer-facing.
    expect(a.disclosure).toContain('at 0.8367765223463683 EUR at 2019 prices per EUR for Germany (DE).')
    expect(a.disclosure).not.toContain('DE/EUR')
    expect(a.disclosure).toContain('0.8367765223463683')
    expect(a.disclosure, 'the reader must be told the factor was left alone')
      .toMatch(/factor is unchanged from its published value/)
    // The disclosure is CUSTOMER-FACING PROSE. It reports a completed step; it must not hand the
    // reader an arithmetic instruction, and least of all one that is wrong on the resolver path,
    // where the 1e6 has already been applied and applying it again is a millionfold error.
    expect(a.disclosure, 'customer prose must not instruct anyone to divide')
      .not.toMatch(/1e6|divisor|divide|million/i)
  })

  it('C5 a composite scalar carries its basis and coverage, and says it is an average', () => {
    const a = convertSpendToFactorBasis(base({ region_code: 'WF', currency: 'USD', conversion: WF_USD }))
    expect(a.basis).toBe('row_composite')
    expect(a.gdp_coverage_pct).toBe(90.6)
    expect(a.disclosure).toMatch(/GDP-weighted average/)
    expect(a.disclosure).toContain('90.6%')
    expect(a.disclosure, 'a composite must never read as a national figure')
      .toMatch(/not any one country/)
    // a published scalar says none of that
    const p = convertSpendToFactorBasis(base())
    expect(p.basis).toBe('published')
    expect(p.gdp_coverage_pct).toBeNull()
    expect(p.disclosure).not.toMatch(/GDP-weighted average/)
  })

  it('C6 an unusable scalar THROWS rather than returning the unconverted amount', () => {
    // Returning the unconverted figure would produce a number that looks converted and is not.
    const bad = (over: Partial<SpendConversionRow>) =>
      () => convertSpendToFactorBasis(base({ conversion: { ...DE_EUR, ...over } }))
    expect(bad({ to_eur2019_per_unit: 0 })).toThrow(/greater than zero/)
    expect(bad({ to_eur2019_per_unit: -0.8 })).toThrow(/greater than zero/)
    expect(bad({ to_eur2019_per_unit: NaN })).toThrow(/finite/)
    expect(bad({ to_eur2019_per_unit: Infinity })).toThrow(/finite/)
    expect(bad({ edition_id: '' })).toThrow(/edition_id is required/)
    expect(() => convertSpendToFactorBasis(base({ amount: Infinity }))).toThrow(/finite/)
  })

  it('C7 absent a conversion row there is no adjustment, and the mismatches still stand', () => {
    // The caller with no row simply does not call this. The resolver's caveats report the
    // situation, and they are unaffected by anything in this module.
    const r = resolveSpendFactor({
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'GBP', reporting_year: 2026, spend_price_basis: 'basic',
    })
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    expect(r.caveats.price_year_mismatch, 'factor is 2019, query is 2026').toBe(true)
    expect(r.caveats.currency_mismatch, 'factor is EUR, query is GBP').toBe(true)
    expect(r.factor.price_year).toBe(2019)
  })

  it('C8 an adjustment does NOT clear the caveat it addresses', () => {
    // The caveats describe the factor against the query and are computed before any adjustment
    // exists. A caller that hides the caveat once it has converted removes the reader's ability to
    // check the step; the adjustment record sits BESIDE the caveat, not instead of it.
    const q: SpendFactorQuery = {
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'EUR', reporting_year: 2026, spend_price_basis: 'basic',
    }
    const r = resolveSpendFactor(q)
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    const a = convertSpendToFactorBasis(base())
    expect(a.output_amount).toBeLessThan(a.input_amount)

    const again = resolveSpendFactor(q)
    if (!again || again.kind === 'absent') throw new Error('expected a factor')
    expect(again.caveats.price_year_mismatch, 'still true after converting').toBe(true)
    expect(again.caveats.price_basis_mismatch, 'never addressed by a conversion at all').toBe(false)
  })
})

describe('assertSingleFactorBasisConversion', () => {
  const one = convertSpendToFactorBasis(base())
  const two = convertSpendToFactorBasis(base({ region_code: 'WF', currency: 'USD', conversion: WF_USD }))

  it('G1 zero or one price-year transformation passes', () => {
    expect(() => assertSingleFactorBasisConversion([])).not.toThrow()
    expect(() => assertSingleFactorBasisConversion([one])).not.toThrow()
  })

  it('G2 two price-year transformations THROW, naming the hazard', () => {
    expect(() => assertSingleFactorBasisConversion([one, two])).toThrow(/price-year transformations/)
    expect(() => assertSingleFactorBasisConversion([one, two])).toThrow(/1\.43 rather than 1\.195/)
  })

  it('G3 the double-counted figure is ~20% high and looks entirely plausible', () => {
    // This is what the guard prevents, computed rather than asserted in prose. Applying the German
    // scalar twice divides by cpi_ratio twice, so the SPEND is understated and the resulting
    // emissions figure would be too LOW here; the mirror case — two inflations — is the +20% one.
    // Either way the CPI ratio enters twice, and neither result looks wrong on its face.
    const once = 100_000 * DE_EUR.to_eur2019_per_unit
    const twice = once * DE_EUR.to_eur2019_per_unit
    const cpiRatio = 1 / DE_EUR.to_eur2019_per_unit
    expect(cpiRatio).toBeCloseTo(1.195062209914714, 12)
    expect(once / twice, 'the ratio between one and two applications is the CPI ratio itself')
      .toBeCloseTo(cpiRatio, 9)
    expect(cpiRatio * cpiRatio, 'squared, which is the ~43% the guard names')
      .toBeCloseTo(1.4281736855662397, 9)
  })
})

describe('the whole chain', () => {
  it('W1 Germany p28: the published factor becomes 0.21473710338586816 kg per 2024 EUR', () => {
    // The end-to-end the whole workstream exists for. One 2024 euro of German fabricated-metal
    // spend, priced with the published factor, with the 1e6 applied as its own visible step.
    const a = convertSpendToFactorBasis(base({ amount: 1 }))
    const inMillions = a.output_amount / 1e6          // THE NAMED 1e6 STEP
    const kgCO2e = inMillions * PUBLISHED_P28_DE

    expect(a.output_amount).toBe(0.8367765223463683)
    expect(kgCO2e).toBe(0.21473710338586816)

    // and it must be BELOW the published per-2019-EUR value, because prices rose
    expect(kgCO2e, 'a 2024 euro buys less, so it must embody less')
      .toBeLessThan(PUBLISHED_P28_DE / 1e6)
    expect(PUBLISHED_P28_DE / 1e6).toBeCloseTo(0.256624, 6)
  })

  it('W2 the resolver path agrees, and must NOT divide by 1e6 a second time', () => {
    // resolveSpendFactor already applies the divisor when it builds a SpendFactor, so the two
    // routes agree only if exactly one of them divides. Dividing twice is a millionfold error.
    const r = resolveSpendFactor({
      region: 'DE', sector_key: 'p28', factor_type: 'product',
      reporting_currency: 'EUR', reporting_year: 2024, spend_price_basis: 'basic',
    })
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    expect(r.factor.value, 'the resolver has already divided by 1e6')
      .toBeCloseTo(PUBLISHED_P28_DE / 1e6, 12)

    const a = convertSpendToFactorBasis(base({ amount: 1 }))
    const viaResolver = a.output_amount * r.factor.value        // no second divisor
    const viaPublished = (a.output_amount / 1e6) * PUBLISHED_P28_DE
    expect(viaResolver).toBeCloseTo(viaPublished, 15)
    expect(viaResolver).toBeCloseTo(0.21473710338586816, 12)

    // the mistake the doc comment warns about, made explicit
    const dividedTwice = (a.output_amount / 1e6) * r.factor.value
    expect(dividedTwice / viaResolver).toBeCloseTo(1e-6, 12)
  })

  it('W3 every step of the row is inspectable, and the sources are nameable', () => {
    const r = resolveSpendFactor({
      region: 'DE', sector_key: 'p28', factor_type: 'product',
      reporting_currency: 'EUR', reporting_year: 2024, spend_price_basis: 'basic',
    })
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    const adj: SpendAdjustment = convertSpendToFactorBasis(base({ amount: 250_000 }))
    assertSingleFactorBasisConversion([adj])

    expect(adj.input_amount).toBe(250_000)
    expect(adj.output_amount).toBeCloseTo(250_000 * 0.8367765223463683, 6)
    expect(adj.output_amount * r.factor.value).toBeCloseTo(53_684.27584646704, 4)

    // both halves can be named: the factor's publisher and the conversion's edition
    expect(r.source.doi).toBe('10.5281/zenodo.5589597')
    expect(adj.edition_id).toBe(EDITION)
    expect(adj.factor_value_modified).toBe(false)
  })
})
