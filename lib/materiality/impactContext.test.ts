import { describe, it, expect } from 'vitest'
import {
  VALUE_CHAIN_POSITIONS, TIME_HORIZONS, valueChainLabel, timeHorizonLabel,
} from './impactContext'

// ------------------------------------------------------------------------------------------------
// These two lists were duplicated verbatim in two live contributor-facing forms until 21 Aug 2026.
// The extraction created one new failure mode and preserved one risk, and this file covers both:
//
//   NEW    a UI option list that can drift from a DB CHECK constraint. An option added here without
//          a migration gives a contributor a button that saves nothing and a Postgres constraint
//          error they cannot act on. Tests 1-2 pin the code sets to the constraints.
//
//   MOVED  a silent rewording during the extraction. The labels are copy that contributors have
//          already been reading; test 9 pins them character for character, and it is the only
//          mechanical check that the move was lossless.
// ------------------------------------------------------------------------------------------------

describe('impactContext -- the option lists match their CHECK constraints', () => {
  it('1 value_chain_position codes == check (value_chain_position <@ array[...])', () => {
    // supabase/migrations/20260838_materiality_impact_worksheet_schema.sql:445-446
    expect(VALUE_CHAIN_POSITIONS.map(v => v.code)).toEqual(
      ['own_operations', 'upstream', 'downstream'])
  })

  it('2 time_horizon codes == check (time_horizon in (...))', () => {
    // supabase/migrations/20260838_materiality_impact_worksheet_schema.sql:449-450
    expect(TIME_HORIZONS.map(h => h.code)).toEqual(['short', 'medium', 'long'])
  })

  it('3 codes are unique within each list', () => {
    for (const list of [VALUE_CHAIN_POSITIONS, TIME_HORIZONS]) {
      const codes = list.map(x => x.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it('4 every label is non-empty and distinct', () => {
    for (const list of [VALUE_CHAIN_POSITIONS, TIME_HORIZONS]) {
      const labels = list.map(x => x.label)
      for (const l of labels) expect(l.trim().length).toBeGreaterThan(0)
      expect(new Set(labels).size).toBe(labels.length)
    }
  })
})

describe('impactContext -- label lookup never leaks a raw code', () => {
  it('5 valueChainLabel resolves every valid code', () => {
    expect(valueChainLabel('own_operations')).toBe('Our own operations')
    expect(valueChainLabel('upstream')).toBe('Upstream — our suppliers')
    expect(valueChainLabel('downstream')).toBe('Downstream — our customers and products')
  })

  it('6 timeHorizonLabel resolves every valid code', () => {
    expect(timeHorizonLabel('short')).toBe('Short — within a year')
    expect(timeHorizonLabel('medium')).toBe('Medium — one to five years')
    expect(timeHorizonLabel('long')).toBe('Long — more than five years')
  })

  it('7 an UNRECOGNISED code returns null, NOT the code itself', () => {
    // The guard. A fallback to the code would put "upstream" in front of a reader on the audit
    // screen — the one thing the plain-language rule exists to prevent — and it would do it
    // silently, looking exactly like a real answer.
    expect(valueChainLabel('sideways')).toBeNull()
    expect(timeHorizonLabel('eventually')).toBeNull()
    expect(valueChainLabel('OWN_OPERATIONS')).toBeNull()   // case-sensitive, like the constraint
  })

  it('8 absent input returns null, never a throw', () => {
    for (const f of [valueChainLabel, timeHorizonLabel]) {
      expect(f(null)).toBeNull()
      expect(f(undefined)).toBeNull()
      expect(f('')).toBeNull()
      expect(f(42 as unknown as string)).toBeNull()
    }
  })

  it('9 the labels are EXACTLY what the two forms were already showing', () => {
    // ⚠️ THE EXTRACTION CHECK. Copied from the deployed strings, not re-typed from the spec — which
    // differs trivially ("Upstream, our suppliers" with a comma). These are customer-facing copy
    // already in front of contributors, so the move had to be lossless, and this is what says it
    // was. \u2014 is an EM dash (U+2014), written as an escape here so a copy-paste through a
    // terminal cannot silently substitute a hyphen and make this test pass against wrong copy.
    expect(VALUE_CHAIN_POSITIONS).toEqual([
      { code: 'own_operations', label: 'Our own operations' },
      { code: 'upstream', label: 'Upstream \u2014 our suppliers' },
      { code: 'downstream', label: 'Downstream \u2014 our customers and products' },
    ])
    expect(TIME_HORIZONS).toEqual([
      { code: 'short', label: 'Short \u2014 within a year' },
      { code: 'medium', label: 'Medium \u2014 one to five years' },
      { code: 'long', label: 'Long \u2014 more than five years' },
    ])
  })
})
