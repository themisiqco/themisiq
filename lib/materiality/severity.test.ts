/**
 * Severity — spec v10 §6.2's own argument, made executable.
 *
 * ⚠️ THE 64-ROW TABLE BELOW IS THE POINT OF THIS FILE. §6.2 justifies the materiality threshold and
 * the top-band override by counting outcomes across all 64 possible score combinations, and
 * publishes the comparison: 32 of 64 material on the mean alone, 41 with the override at 4, 56 with
 * an override at 3-and-above. Those three numbers are what an auditor asks about, and they should be
 * checkable by reading this file rather than by trusting the implementation.
 *
 * So the table is LITERAL DATA, not generated at runtime from the module under test. Every row can
 * be verified with a calculator: three scores, their mean to four places, whether the mean alone
 * makes it material, whether the published rule makes it material, and which rule decided. The
 * three totals are then counted FROM THE TABLE and asserted against the spec's published figures —
 * so if the table were ever edited to match a broken implementation, the totals would stop matching
 * the standard and this file would fail.
 *
 * The rows were derived from the §6.2 prose independently of the module: a floating-point mean and a
 * plain `>=`, where severity.ts uses an exact integer comparison. Two derivations that agree on all
 * 64 is a real check; one derivation checked against itself is not.
 */

import { describe, it, expect } from 'vitest'
import {
  computeSeverity, basisFor, SeverityInputError,
  MEAN_THRESHOLD, OVERRIDE_BAND, METHOD_DISCLOSURE,
  type SeverityInput, type TopicCategory,
} from './severity'

// [scale, scope, irremediability, mean, materialByMeanAlone, material, rule]
type Row = [number, number, number, number, boolean, boolean, string]

// mean alone: 32 of 64   override at 4: 41 of 64   override at 3+: 56 of 64
const TABLE: Row[] = [
  [1, 1, 1, 1.0000, false, false, 'mean'],
  [1, 1, 2, 1.3333, false, false, 'mean'],
  [1, 1, 3, 1.6667, false, false, 'mean'],
  [1, 1, 4, 2.0000, false, true, 'override'],
  [1, 2, 1, 1.3333, false, false, 'mean'],
  [1, 2, 2, 1.6667, false, false, 'mean'],
  [1, 2, 3, 2.0000, false, false, 'mean'],
  [1, 2, 4, 2.3333, false, true, 'override'],
  [1, 3, 1, 1.6667, false, false, 'mean'],
  [1, 3, 2, 2.0000, false, false, 'mean'],
  [1, 3, 3, 2.3333, false, false, 'mean'],
  [1, 3, 4, 2.6667, true, true, 'mean'],
  [1, 4, 1, 2.0000, false, true, 'override'],
  [1, 4, 2, 2.3333, false, true, 'override'],
  [1, 4, 3, 2.6667, true, true, 'mean'],
  [1, 4, 4, 3.0000, true, true, 'mean'],
  [2, 1, 1, 1.3333, false, false, 'mean'],
  [2, 1, 2, 1.6667, false, false, 'mean'],
  [2, 1, 3, 2.0000, false, false, 'mean'],
  [2, 1, 4, 2.3333, false, true, 'override'],
  [2, 2, 1, 1.6667, false, false, 'mean'],
  [2, 2, 2, 2.0000, false, false, 'mean'],
  [2, 2, 3, 2.3333, false, false, 'mean'],
  [2, 2, 4, 2.6667, true, true, 'mean'],
  [2, 3, 1, 2.0000, false, false, 'mean'],
  [2, 3, 2, 2.3333, false, false, 'mean'],
  [2, 3, 3, 2.6667, true, true, 'mean'],
  [2, 3, 4, 3.0000, true, true, 'mean'],
  [2, 4, 1, 2.3333, false, true, 'override'],
  [2, 4, 2, 2.6667, true, true, 'mean'],
  [2, 4, 3, 3.0000, true, true, 'mean'],
  [2, 4, 4, 3.3333, true, true, 'mean'],
  [3, 1, 1, 1.6667, false, false, 'mean'],
  [3, 1, 2, 2.0000, false, false, 'mean'],
  [3, 1, 3, 2.3333, false, false, 'mean'],
  [3, 1, 4, 2.6667, true, true, 'mean'],
  [3, 2, 1, 2.0000, false, false, 'mean'],
  [3, 2, 2, 2.3333, false, false, 'mean'],
  [3, 2, 3, 2.6667, true, true, 'mean'],
  [3, 2, 4, 3.0000, true, true, 'mean'],
  [3, 3, 1, 2.3333, false, false, 'mean'],
  [3, 3, 2, 2.6667, true, true, 'mean'],
  [3, 3, 3, 3.0000, true, true, 'mean'],
  [3, 3, 4, 3.3333, true, true, 'mean'],
  [3, 4, 1, 2.6667, true, true, 'mean'],
  [3, 4, 2, 3.0000, true, true, 'mean'],
  [3, 4, 3, 3.3333, true, true, 'mean'],
  [3, 4, 4, 3.6667, true, true, 'mean'],
  [4, 1, 1, 2.0000, false, true, 'override'],
  [4, 1, 2, 2.3333, false, true, 'override'],
  [4, 1, 3, 2.6667, true, true, 'mean'],
  [4, 1, 4, 3.0000, true, true, 'mean'],
  [4, 2, 1, 2.3333, false, true, 'override'],
  [4, 2, 2, 2.6667, true, true, 'mean'],
  [4, 2, 3, 3.0000, true, true, 'mean'],
  [4, 2, 4, 3.3333, true, true, 'mean'],
  [4, 3, 1, 2.6667, true, true, 'mean'],
  [4, 3, 2, 3.0000, true, true, 'mean'],
  [4, 3, 3, 3.3333, true, true, 'mean'],
  [4, 3, 4, 3.6667, true, true, 'mean'],
  [4, 4, 1, 3.0000, true, true, 'mean'],
  [4, 4, 2, 3.3333, true, true, 'mean'],
  [4, 4, 3, 3.6667, true, true, 'mean'],
  [4, 4, 4, 4.0000, true, true, 'mean'],
]

/** A negative, actual, environmental determination — the case §6.2's table is about. */
const neg = (s: number | null, sc: number | null, ir: number | null,
             over: Partial<SeverityInput> = {}): SeverityInput => ({
  direction: 'negative', nature: 'actual', category: 'env',
  scale: s, scope: sc, irremediability: ir, ...over,
})

describe('§6.2 — all 64 score combinations', () => {
  it('the fixture covers every combination exactly once', () => {
    expect(TABLE).toHaveLength(64)
    expect(new Set(TABLE.map(r => `${r[0]}${r[1]}${r[2]}`)).size).toBe(64)
  })

  it.each(TABLE)(
    'scale %i, scope %i, irremediability %i -> mean %f, material %s, rule %s',
    (s, sc, ir, expectedMean, _byMeanAlone, expectedMaterial, expectedRule) => {
      const r = computeSeverity(neg(s, sc, ir))
      expect(r.complete).toBe(true)
      if (!r.complete) return
      expect(r.severity).toBeCloseTo(expectedMean, 4)
      expect(r.material).toBe(expectedMaterial)
      expect(r.rule).toBe(expectedRule)
      expect(r.values).toEqual([s, sc, ir])
    },
  )
})

describe('§6.2 — the three published totals, counted from the table', () => {
  // ⚠️ Counted from the FIXTURE, not from the module. These are the numbers the spec argues from;
  // if the table ever drifted to match a broken implementation, these would catch it.
  it('mean >= 2.5 alone makes 32 of 64 material', () => {
    expect(TABLE.filter(r => r[4]).length).toBe(32)
  })

  it('mean >= 2.5 with the override at 4 makes 41 of 64 material', () => {
    expect(TABLE.filter(r => r[5]).length).toBe(41)
  })

  it('an override at 3-and-above would make 56 of 64 material — which is why it is not used', () => {
    const at3Plus = TABLE.filter(r => r[4] || r[0] >= 3 || r[1] >= 3 || r[2] >= 3)
    expect(at3Plus.length).toBe(56)
  })

  it('the override at 4 adds exactly nine combinations to the mean', () => {
    expect(TABLE.filter(r => r[5] && !r[4]).length).toBe(9)
    expect(TABLE.filter(r => r[6] === 'override').length).toBe(9)
  })

  it('and the module agrees with the table on all three counts', () => {
    const results = TABLE.map(r => computeSeverity(neg(r[0], r[1], r[2])))
    expect(results.filter(r => r.complete && r.material).length).toBe(41)
    expect(results.filter(r => r.complete && r.rule === 'override').length).toBe(9)
    expect(results.filter(r => r.complete && r.rule === 'mean').length).toBe(55)
  })
})

describe('§6.2 — the three worked cases the override exists for', () => {
  // Quoted from the spec's own table. Each has a mean below 2.5 and is material only by override.
  const cases: [string, number, number, number, number][] = [
    ['localised soil contamination — small, narrow, permanent', 1, 1, 4, 2.0],
    ['one catastrophic workplace injury, isolated, recoverable', 4, 1, 1, 2.0],
    ['small wage shortfall across the entire workforce', 2, 4, 1, 2.3],
  ]

  it.each(cases)('%s', (_label, s, sc, ir, approxMean) => {
    const r = computeSeverity(neg(s, sc, ir))
    expect(r.complete).toBe(true)
    if (!r.complete) return
    expect(r.severity).toBeCloseTo(approxMean, 1)
    expect(r.severity).toBeLessThan(MEAN_THRESHOLD)   // the mean alone would have missed it
    expect(r.material).toBe(true)                      // the override caught it
    expect(r.rule).toBe('override')
  })
})

describe('ESRS 1 ¶40 — social topics take max, and the override is subsumed', () => {
  it.each(TABLE)(
    'scale %i, scope %i, irremediability %i on a social topic',
    (s, sc, ir) => {
      const r = computeSeverity(neg(s, sc, ir, { category: 'soc' }))
      expect(r.complete).toBe(true)
      if (!r.complete) return

      const max = Math.max(s, sc, ir)
      expect(r.severity).toBe(max)
      expect(r.material).toBe(max >= MEAN_THRESHOLD)

      // ⚠️ THE CLAIM THE REPORT MUST NOT MAKE. The override cannot decide a social row, because max
      // is already 4 whenever a dimension is 4.
      expect(r.rule).not.toBe('override')
      expect(r.rule).not.toBe('mean')
      expect(r.rule).toBe([s, sc, ir].includes(OVERRIDE_BAND) ? 'subsumed_override' : 'max')
    },
  )

  it('the override never fires on a social topic, across all 64', () => {
    const rules = TABLE.map(r => computeSeverity(neg(r[0], r[1], r[2], { category: 'soc' })))
      .map(r => (r.complete ? r.rule : null))
    expect(rules.filter(x => x === 'override')).toHaveLength(0)
    expect(rules.filter(x => x === 'mean')).toHaveLength(0)
    // 37 of 64 combinations contain at least one 4 (64 - 3^3).
    expect(rules.filter(x => x === 'subsumed_override')).toHaveLength(37)
    expect(rules.filter(x => x === 'max')).toHaveLength(27)
  })

  it('max is not the mean — a social row can be material where an environmental one is not', () => {
    const social = computeSeverity(neg(1, 1, 3, { category: 'soc' }))
    const env = computeSeverity(neg(1, 1, 3, { category: 'env' }))
    expect(social.complete && social.severity).toBe(3)
    expect(social.complete && social.material).toBe(true)
    expect(env.complete && env.material).toBe(false)
  })

  it('gov is not social — it takes the mean', () => {
    const r = computeSeverity(neg(1, 1, 3, { category: 'gov' }))
    expect(r.complete && r.rule).toBe('mean')
    expect(r.complete && r.material).toBe(false)
  })
})

describe('ESRS 1 ¶41 — positive impacts carry no irremediability', () => {
  it('basisFor names the difference in one place', () => {
    expect(basisFor('negative')).toEqual(['scale', 'scope', 'irremediability'])
    expect(basisFor('positive')).toEqual(['scale', 'scope'])
  })

  // ⚠️ IGNORED, not merely unused: every irremediability value including null must give an
  // identical result. If it leaked into the mean, 16 of these 80 comparisons would differ.
  const irremediabilityValues: (number | null)[] = [null, 1, 2, 3, 4]
  const pairs: [number, number][] = []
  for (let s = 1; s <= 4; s++) for (let sc = 1; sc <= 4; sc++) pairs.push([s, sc])

  it.each(pairs)('scale %i, scope %i is unaffected by any irremediability', (s, sc) => {
    const results = irremediabilityValues.map(ir => computeSeverity({
      direction: 'positive', nature: 'actual', category: 'env',
      scale: s, scope: sc, irremediability: ir,
    }))
    for (const r of results) {
      expect(r).toEqual(results[0])
      expect(r.basis).toEqual(['scale', 'scope'])
      expect(r.complete && r.values).toEqual([s, sc])
    }
  })

  it('a positive impact is complete without irremediability, where a negative one is not', () => {
    const base = { nature: 'actual' as const, category: 'env' as const,
                   scale: 3, scope: 3, irremediability: null }
    expect(computeSeverity({ ...base, direction: 'positive' }).complete).toBe(true)
    const negative = computeSeverity({ ...base, direction: 'negative' })
    expect(negative.complete).toBe(false)
    expect(negative.missing).toEqual(['irremediability'])
  })

  it('the two-dimension threshold lands exactly on 2.5 and is material', () => {
    // A sum of 5 over two dimensions is exactly the threshold — the case the exact integer
    // comparison in severity.ts exists for.
    const r = computeSeverity({ direction: 'positive', nature: 'actual', category: 'env',
                                scale: 2, scope: 3, irremediability: null })
    expect(r.complete && r.severity).toBe(2.5)
    expect(r.complete && r.material).toBe(true)
    expect(r.complete && r.rule).toBe('mean')
  })

  it('a positive impact is never netted against a negative one — they are separate answers', () => {
    const negative = computeSeverity(neg(4, 4, 4))
    const positive = computeSeverity({ direction: 'positive', nature: 'actual', category: 'env',
                                       scale: 1, scope: 1, irremediability: null })
    expect(negative.complete && negative.material).toBe(true)
    expect(positive.complete && positive.material).toBe(false)
    // Nothing in either result references the other, and no shape holds both.
    expect(Object.keys(negative)).not.toContain('positive')
    expect(Object.keys(negative)).not.toContain('net')
  })
})

describe('likelihood — reported, suppressed, and never folded into the number', () => {
  const likelihoods: (number | null)[] = [null, 1, 2, 3, 4]

  // ⚠️ §6.2 calls applying likelihood to an ACTUAL impact the most common technical error in a DMA.
  it.each(['negative', 'positive'] as const)(
    'an actual %s impact is unchanged by any likelihood', direction => {
      const results = likelihoods.map(l => computeSeverity({
        direction, nature: 'actual', category: 'env',
        scale: 3, scope: 2, irremediability: direction === 'negative' ? 2 : null, likelihood: l,
      }))
      for (const r of results) {
        expect(r).toEqual(results[0])
        expect(r.likelihood.applicable).toBe(false)
        expect(r.likelihood.suppressedBy).toBe('actual_impact')
        expect(r.likelihood.value).toBeNull()
      }
    })

  it('a potential social impact has its likelihood suppressed by ¶40, not by nature', () => {
    const r = computeSeverity(neg(2, 2, 2, { nature: 'potential', category: 'soc', likelihood: 1 }))
    expect(r.likelihood.applicable).toBe(false)
    expect(r.likelihood.suppressedBy).toBe('human_rights_precedence')
    expect(r.likelihood.value).toBeNull()
  })

  it('a severe potential social impact stays material at the lowest likelihood', () => {
    // The case ¶40 exists for: never scored down for being unlikely.
    const r = computeSeverity(neg(4, 1, 1, { nature: 'potential', category: 'soc', likelihood: 1 }))
    expect(r.complete && r.material).toBe(true)
    expect(r.complete && r.severity).toBe(4)
  })

  it('a potential non-social impact reports likelihood as applicable and carries the value', () => {
    const r = computeSeverity(neg(2, 2, 2, { nature: 'potential', likelihood: 3 }))
    expect(r.likelihood.applicable).toBe(true)
    expect(r.likelihood.suppressedBy).toBeNull()
    expect(r.likelihood.value).toBe(3)
  })

  it('and the severity is STILL unweighted — the weighting is not defined by the spec', () => {
    // ⚠️ If a weighting is ever added, this test fails and forces the disclosure to be updated.
    const low = computeSeverity(neg(3, 3, 3, { nature: 'potential', likelihood: 1 }))
    const high = computeSeverity(neg(3, 3, 3, { nature: 'potential', likelihood: 4 }))
    expect(low.complete && low.severity).toBe(3)
    expect(high.complete && high.severity).toBe(3)
    expect(METHOD_DISCLOSURE.likelihoodWeighting).toMatch(/NOT APPLIED/)
  })
})

describe('§6.1 — a missing dimension is not a low score', () => {
  const dims = ['scale', 'scope', 'irremediability'] as const

  it.each(dims)('a negative determination missing %s is incomplete, not low', dim => {
    const full = { scale: 3, scope: 3, irremediability: 3 }
    const r = computeSeverity(neg(
      dim === 'scale' ? null : full.scale,
      dim === 'scope' ? null : full.scope,
      dim === 'irremediability' ? null : full.irremediability,
    ))
    expect(r.complete).toBe(false)
    expect(r.severity).toBeNull()
    expect(r.material).toBeNull()
    expect(r.rule).toBeNull()
    expect(r.values).toBeNull()
    expect(r.missing).toEqual([dim])
  })

  // ⚠️ THE FAILURE THIS GUARDS AGAINST. A silent default would be systematically low and would look
  // exactly like a real score. Both candidate defaults are checked against explicitly.
  it('null does not become 1', () => {
    const missing = computeSeverity(neg(4, 4, null))
    const asOne = computeSeverity(neg(4, 4, 1))
    expect(missing.severity).toBeNull()
    expect(asOne.complete && asOne.severity).toBeCloseTo(3, 4)
    expect(missing.severity).not.toBe(asOne.severity)
    expect(missing.material).not.toBe(asOne.material)
  })

  it('null does not become 0, and no partial mean is taken over what is present', () => {
    const missing = computeSeverity(neg(4, 4, null))
    expect(missing.severity).toBeNull()
    // A partial mean over the two present dimensions would be 4 — a material-looking figure.
    expect(missing.severity).not.toBe(4)
    expect(missing.material).toBeNull()
  })

  it('several missing dimensions are all named', () => {
    const r = computeSeverity(neg(null, null, 3))
    expect(r.complete).toBe(false)
    expect(r.missing).toEqual(['scale', 'scope'])
  })

  it('an entirely empty determination yields no conclusion of any kind', () => {
    const r = computeSeverity(neg(null, null, null))
    expect(r.complete).toBe(false)
    expect(r.missing).toEqual(['scale', 'scope', 'irremediability'])
    expect(r.material).toBeNull()
  })

  it('undefined is treated as absent, not as an error', () => {
    const r = computeSeverity({ direction: 'negative', nature: 'actual', category: 'env',
                                scale: 3, scope: 3 })
    expect(r.complete).toBe(false)
    expect(r.missing).toEqual(['irremediability'])
  })

  it('basis is reported even when the determination is incomplete', () => {
    expect(computeSeverity(neg(null, null, null)).basis)
      .toEqual(['scale', 'scope', 'irremediability'])
  })
})

describe('out-of-range values throw rather than being coerced', () => {
  // Absence is §6.1's abstention and returns incomplete. An out-of-range NUMBER is a bug: 20260838's
  // CHECK constraints make it unstorable, so clamping it would fabricate a compliance figure.
  const bad: [string, number][] = [['zero', 0], ['five', 5], ['negative', -1], ['fractional', 2.5]]

  it.each(bad)('scale of %s is refused', (_label, v) => {
    expect(() => computeSeverity(neg(v, 2, 2))).toThrow(SeverityInputError)
  })

  it('an out-of-range likelihood is refused too', () => {
    expect(() => computeSeverity(neg(2, 2, 2, { nature: 'potential', likelihood: 7 })))
      .toThrow(SeverityInputError)
  })

  it('the message names the scale and the abstention alternative', () => {
    expect(() => computeSeverity(neg(9, 2, 2))).toThrow(/1-4/)
    expect(() => computeSeverity(neg(9, 2, 2))).toThrow(/not enough visibility/i)
  })
})

describe('the disclosed constants and method are exported as one copy', () => {
  it('the thresholds are the spec values', () => {
    expect(MEAN_THRESHOLD).toBe(2.5)
    expect(OVERRIDE_BAND).toBe(4)
  })

  it('every category in the constrained domain is handled', () => {
    const cats: TopicCategory[] = ['env', 'soc', 'gov']
    for (const category of cats) {
      const r = computeSeverity(neg(2, 2, 2, { category }))
      expect(r.complete).toBe(true)
      expect(r.complete && r.rule).toBe(category === 'soc' ? 'max' : 'mean')
    }
  })

  it('the disclosure states the subsumption, so the report cannot claim the override decided', () => {
    expect(METHOD_DISCLOSURE.humanRights).toMatch(/subsumed/i)
    expect(METHOD_DISCLOSURE.humanRights).toMatch(/maximum/i)
  })

  it('the disclosure states that no default is substituted for an absent dimension', () => {
    expect(METHOD_DISCLOSURE.abstention).toMatch(/never scored as a zero or a low/i)
    expect(METHOD_DISCLOSURE.abstention).toMatch(/no partial average/i)
  })

  it('the disclosure states positive impacts are never netted', () => {
    expect(METHOD_DISCLOSURE.positiveImpacts).toMatch(/never netted/i)
  })
})
