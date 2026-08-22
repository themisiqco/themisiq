import { describe, it, expect } from 'vitest'
import {
  IRO1_FIELDS, iro1FieldState, iro1Blockers, iro1OutstandingText,
  type Iro1Row, type Iro1FieldKey,
} from './iro1'

// ------------------------------------------------------------------------------------------------
// ⚠️ WHAT THESE TESTS CANNOT DO, SAID FIRST. The authority on whether a submit is allowed is
// materiality_iro1_submitted_is_complete in migration 20260847 — a SQL CHECK. Vitest has no
// database and this repo has no schema-derived types, so nothing here can prove the screen and the
// constraint agree. Test 1 pins the field keys against the column names as written, which is the
// closest a TypeScript test gets: if the migration gains a sixth limb, these keys are what someone
// diffing the two files will compare.
//
// What IS mechanised is that everything downstream of IRO1_FIELDS derives from it, so the render,
// the three-state display, the submit gate and the outstanding line cannot disagree with each other.
// ------------------------------------------------------------------------------------------------

const KEYS: Iro1FieldKey[] = [
  'value_chain_approach', 'heightened_risk_areas', 'remediation_consideration',
  'due_diligence_link', 'external_experts',
]

const complete = (): Iro1Row =>
  Object.fromEntries(KEYS.map(k => [k, 'answered'])) as Iro1Row

describe('IRO1_FIELDS', () => {
  it('1 holds exactly the five ¶35 limbs, keyed to the migration’s column names', () => {
    expect(IRO1_FIELDS.map(f => f.key)).toEqual(KEYS)
  })

  it('2 declinedKey is the key plus _declined, on every field', () => {
    // The boolean column name is derived rather than typed twice, so the pair cannot fall out of
    // step — but the derivation is only correct if the migration named them this way, which it did.
    for (const f of IRO1_FIELDS) expect(f.declinedKey).toBe(`${f.key}_declined`)
  })

  it('3 every field carries a limb, the standard’s wording, help, and a short fragment', () => {
    for (const f of IRO1_FIELDS) {
      expect(f.limb, f.key).toContain('¶35')
      for (const s of [f.label, f.asks, f.help, f.short]) {
        expect(s.trim().length, f.key).toBeGreaterThan(0)
      }
    }
  })

  it('4 short fragments are distinct — the outstanding line must not repeat itself', () => {
    const shorts = IRO1_FIELDS.map(f => f.short)
    expect(new Set(shorts).size).toBe(shorts.length)
  })
})

describe('iro1FieldState — three states, all reachable', () => {
  it('5 both absent is NOT ADDRESSED, and that is the starting state, not a defect', () => {
    expect(iro1FieldState(null, null)).toBe('not_addressed')
    expect(iro1FieldState(undefined, undefined)).toBe('not_addressed')
    expect(iro1FieldState('', null)).toBe('not_addressed')
    // Whitespace-only is not an answer. Typing a space and deleting it must not read as answered.
    expect(iro1FieldState('   ', null)).toBe('not_addressed')
    // declined explicitly FALSE is still not addressed — the question was put and nothing followed.
    expect(iro1FieldState(null, false)).toBe('not_addressed')
  })

  it('6 text present is ANSWERED, whether declined is null or false', () => {
    expect(iro1FieldState('we did it thus', null)).toBe('answered')
    expect(iro1FieldState('we did it thus', false)).toBe('answered')
  })

  it('7 declined true with no text is DECLINED — a recorded refusal, not a blank', () => {
    expect(iro1FieldState(null, true)).toBe('declined')
    expect(iro1FieldState('', true)).toBe('declined')
  })
})

describe('iro1Blockers', () => {
  it('8 a null row blocks on all five — nothing recorded is not the same as nothing required', () => {
    expect(iro1Blockers(null).map(b => b.key)).toEqual(KEYS)
  })

  it('9 declining counts as dealt with, exactly as the CHECK has it', () => {
    // materiality_iro1_submitted_is_complete: (text is not null or declined is true). A declined
    // limb is complete. If this ever diverged, the screen would demand prose the DB does not.
    const row: Iro1Row = { ...complete(), external_experts: null, external_experts_declined: true }
    expect(iro1Blockers(row)).toEqual([])
  })

  it('10 blockers are the not-addressed limbs, in screen order', () => {
    const row: Iro1Row = { ...complete(), value_chain_approach: null, due_diligence_link: null }
    expect(iro1Blockers(row).map(b => b.key))
      .toEqual(['value_chain_approach', 'due_diligence_link'])
  })
})

describe('iro1OutstandingText', () => {
  it('11 names EVERY outstanding limb, not the first', () => {
    const row: Iro1Row = { ...complete(), value_chain_approach: null, external_experts: null }
    const text = iro1OutstandingText(iro1Blockers(row))
    expect(text).toBe('how the assessment covered your value chain and consultation with external experts')
  })

  it('12 one limb passes through bare; none returns NULL, never ""', () => {
    // '' would render an empty line under the submit button.
    expect(iro1OutstandingText(iro1Blockers({ ...complete(), external_experts: null })))
      .toBe('consultation with external experts')
    expect(iro1OutstandingText(iro1Blockers(complete()))).toBeNull()
    expect(iro1OutstandingText([])).toBeNull()
  })

  it('13 all five reads as a list with a single "and"', () => {
    const t = iro1OutstandingText(iro1Blockers(null))!
    expect(t.match(/ and /g)).toHaveLength(1)
    expect(t.split(', ')).toHaveLength(4)
  })
})
