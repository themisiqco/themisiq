import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fuelEnergyMWh, ENERGY_CONTENT_MWH } from './energyContent'
import { buildB3Energy } from './b3Energy'
import { FUEL_WORDS } from '../ghg/series'

// THE FUEL-OIL GRADE SPLIT, ON THE SURFACES THE ENGINE TESTS DO NOT REACH.
//
// Three mutations survived the engine suite when the split landed, and each is guarded here:
//   - the residual wizard card silently writing the DISTILLATE field (React, untested by this repo)
//   - FUEL_WORDS left carrying the retired 'fuel_oil' token (prose paths, no value assertion)
//   - an energyContent grade entry removed, which is exactly how the AU/NZ throw comes back
//
// ⚠️ THE AU/NZ THROW. energyContent used to resolve the grade from a jurisdiction via
// FUEL_OIL_GRADE_BY_JUR, which mapped only US/CA/UK/EU and threw on anything else — so an Australian
// or New Zealand location with fuel oil crashed the B3 energy total rather than reporting it. That was
// a live defect BEFORE the split and is fixed by deleting the map, not by extending it. These tests
// are what stop it being reintroduced by a well-meaning "add AU and NZ to the map" change.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const pageSrc = readFileSync(join(ROOT, PAGE), 'utf8')

const base = {
  natural_gas_amount: 0, propane_amount: 0, diesel_stationary_amount: 0,
  gasoline_amount: 0, diesel_mobile_amount: 0, purchased_steam_mmbtu: 0,
  electricity_kwh: 0, renewable_electricity_kwh: 0,
  has_natural_gas: false, has_propane: false, has_diesel_stationary: false,
  has_mobile: false, has_purchased_steam: false,
  has_fuel_oil_distillate: false, fuel_oil_distillate_amount: 0,
  has_fuel_oil_residual: false, fuel_oil_residual_amount: 0,
} as any

describe('fuel-oil grades reach the VSME energy path without a jurisdiction', () => {
  it('V1 both grade keys are ordinary ENERGY_CONTENT_MWH entries', () => {
    expect(ENERGY_CONTENT_MWH).toHaveProperty('fuel_oil_distillate_gallon')
    expect(ENERGY_CONTENT_MWH).toHaveProperty('fuel_oil_residual_gallon')
    // The retired key is gone — nothing should resolve it any more.
    expect(ENERGY_CONTENT_MWH).not.toHaveProperty('fuel_oil_gallon')
  })

  it('V2 fuelEnergyMWh takes NO jurisdiction, and residual carries more energy per gallon', () => {
    const d = fuelEnergyMWh('fuel_oil_distillate_gallon', 1000)
    const r = fuelEnergyMWh('fuel_oil_residual_gallon', 1000)
    expect(d).toBeGreaterThan(0)
    expect(r, 'EIA residual No.6 149,690 Btu/gal vs distillate 138,500').toBeGreaterThan(d)
    // The signature is two-arg now. A third argument would be silently ignored, so assert the
    // FUNCTION's arity rather than trusting the call to fail.
    expect(fuelEnergyMWh.length, 'the jurisdiction parameter was deleted').toBe(2)
  })

  it('V3 THE AU/NZ THROW IS GONE — a fuel-oil location in either reports energy', () => {
    // FUEL_OIL_GRADE_BY_JUR mapped US/CA/UK/EU only and threw on anything else. Australia and New
    // Zealand were unreachable in this path entirely.
    for (const country of ['AU', 'NZ', 'US', 'CA', 'GB', 'DE', 'JP', '']) {
      for (const grade of ['distillate', 'residual'] as const) {
        const loc = { ...base, country, [`has_fuel_oil_${grade}`]: true, [`fuel_oil_${grade}_amount`]: 1000 }
        expect(() => buildB3Energy([loc]), `${country || '(blank)'} ${grade} must not throw`).not.toThrow()
        expect(buildB3Energy([loc]).totalMWh, `${country} ${grade}`).toBeGreaterThan(0)
      }
    }
  })

  it('V4 a site burning BOTH grades sums both, and neither is dropped', () => {
    const both = { ...base, country: 'US',
      has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000,
      has_fuel_oil_residual: true, fuel_oil_residual_amount: 1000 }
    const d = { ...base, country: 'US', has_fuel_oil_distillate: true, fuel_oil_distillate_amount: 1000 }
    const r = { ...base, country: 'US', has_fuel_oil_residual: true, fuel_oil_residual_amount: 1000 }
    expect(buildB3Energy([both]).totalMWh).toBeCloseTo(
      buildB3Energy([d]).totalMWh + buildB3Energy([r]).totalMWh, 9)
  })

  it('V5 the grade resolution no longer mirrors the engine\'s country rules', () => {
    // jurisdictionOf() was a hand-maintained second copy of pickEF's country resolution, living in a
    // module that does not import Location either. Deleting it removed a standing drift risk.
    const src = readFileSync(join(ROOT, 'lib/vsme/b3Energy.ts'), 'utf8')
    expect(src, 'the mirror of pickEF country resolution is gone').not.toContain('function jurisdictionOf')
    expect(readFileSync(join(ROOT, 'lib/vsme/energyContent.ts'), 'utf8'))
      .not.toContain('const FUEL_OIL_GRADE_BY_JUR')
  })
})

describe('the retired fuel_oil token is gone from the ONE FUEL_WORDS map', () => {
  // FUEL_WORDS USED TO EXIST TWICE — lib/ghg/series.ts (exported, read by comparability.ts) and a
  // byte-identical local copy in app/dashboard/ghg/page.tsx — and V7 below existed to keep the two in
  // step. The wizard now imports the exported one, so there is nothing to keep in step and V7's job
  // has INVERTED: it asserts the second copy has not come back.
  it('V6 series.ts carries both grades and not the retired token', () => {
    expect(FUEL_WORDS.fuel_oil_distillate).toBe('heating oil')
    expect(FUEL_WORDS.fuel_oil_residual).toBe('heavy fuel oil')
    expect(FUEL_WORDS.fuel_oil, 'the single-key token was retired, not aliased').toBeUndefined()
  })

  it('V7 page.tsx holds NO second copy — it imports the one above', () => {
    // Anchored on the map's own first line rather than the identifier: page.tsx must still MENTION
    // FUEL_WORDS (it imports and calls it), so grepping the name would fail against correct code.
    // What must not reappear is a declaration, and `gasoline: 'petrol'` is unique to the map body.
    const body = pageSrc.split('\n').filter(l => l.includes("gasoline: 'petrol'"))
    expect(body, 'a local FUEL_WORDS map has come back — collapse it onto lib/ghg/series.ts').toHaveLength(0)
    expect(pageSrc, 'no local declaration under any name').not.toMatch(/const FUEL_WORDS/)
    // ...and the import that replaced it is really there, so the assertion above cannot pass because
    // the whole feature was deleted. Matched on the import LINE containing the name rather than on an
    // exact statement: FUEL_WORDS was collapsed first and its two sibling maps followed on the same
    // day, so the statement now names three symbols and pinning its spelling would break on the next
    // one added. lib/ghg/wordMaps.test.ts owns the general form of this guard.
    const importLine = pageSrc.split('\n').filter(l => l.includes("from '../../../lib/ghg/series'") && !l.startsWith('import type'))
    expect(importLine, 'one value import from series.ts').toHaveLength(1)
    expect(importLine[0], 'FUEL_WORDS must be imported').toContain('FUEL_WORDS')
    expect(pageSrc, 'and it is still used to word the unpriceable-location message').toContain('FUEL_WORDS[u.fuel]')
  })
})

describe('each wizard card writes its own fields', () => {
  // THE MUTATION THIS EXISTS FOR: the residual card's amount input writing
  // fuel_oil_distillate_amount. Nothing in the suite noticed — the cards are React and this repo does
  // not test components, so a crossed write is invisible until a customer's heavy fuel oil is priced
  // as heating oil. Read from source; it is the only handle available.
  const cardBlock = (token: string): string => {
    const marker = `streamQuestion('${token}')`
    const start = pageSrc.indexOf(marker)
    if (start < 0) throw new Error(`no QuestionCard for ${token} in ${PAGE}`)
    const end = pageSrc.indexOf('</QuestionCard>', start)
    if (end < 0) throw new Error(`unterminated QuestionCard for ${token}`)
    return pageSrc.slice(start, end)
  }

  for (const [token, other] of [
    ['fuel_oil_distillate', 'fuel_oil_residual'],
    ['fuel_oil_residual', 'fuel_oil_distillate'],
  ] as const) {
    it(`V8 the ${token} card touches only ${token} fields`, () => {
      const block = cardBlock(token)
      for (const suffix of ['_amount', '_unit']) {
        expect(block, `writes ${token}${suffix}`).toContain(`${token}${suffix}`)
        expect(block, `must NOT touch ${other}${suffix}`).not.toContain(`${other}${suffix}`)
      }
      expect(block, `toggles has_${token}`).toContain(`has_${token}`)
      expect(block, `must NOT toggle has_${other}`).not.toContain(`has_${other}`)
    })
  }

  it('V9 both cards exist and the retired single card is gone', () => {
    expect(() => cardBlock('fuel_oil_distillate')).not.toThrow()
    expect(() => cardBlock('fuel_oil_residual')).not.toThrow()
    expect(pageSrc, 'the one-card version is retired').not.toContain("streamQuestion('fuel_oil')")
    expect(pageSrc).not.toContain('fuel_oil_gallons')
  })
})
