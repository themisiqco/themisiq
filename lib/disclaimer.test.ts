import { describe, it, expect } from 'vitest'
import { disclaimerParas, PURPOSE_PHRASE, type DisclaimerPurpose } from './disclaimer'

// This text is the platform's legal position and now has ONE copy that varies in exactly one span.
// Nothing else in the repo would notice if a paragraph were dropped, blanked or truncated in an
// unrelated edit — before the extraction, four byte-identical copies at least made a silent
// single-copy edit visible by divergence. That redundancy is gone; these assertions replace it.
//
// ⚠️ TEST 3 IS THE ONE THAT ENFORCES THE SCOPE OF THE PARAMETER. Paragraph 1 was made variable on
// 22 Aug 2026 so that three verifier- and obligation-grade surfaces would stop describing
// themselves as screenings. The intent was that the purpose span, and NOTHING else, could differ
// per surface. Test 3 is the difference between that being an intention and it being a property
// the code has: it asserts that everything from " purposes only." onward is byte-identical across
// every purpose, so no future edit can quietly give one surface different liability wording.

const ALL: DisclaimerPurpose[] = ['screening', 'verification_support', 'disclosure_preparation']

describe('disclaimerParas', () => {
  it('1 every purpose yields exactly six paragraphs — a silent truncation must fail here', () => {
    for (const p of ALL) {
      expect(disclaimerParas(p), `purpose ${p}`).toHaveLength(6)
    }
  })

  it('2 paragraphs 2-6 are BYTE-IDENTICAL across every purpose', () => {
    // The parameter must not reach them. These five carry the verification, evolving-law,
    // no-relationship, liability and not-an-assurance-provider positions — the paragraphs where
    // a per-surface difference would be a genuine legal divergence rather than an accurate one.
    const tails = ALL.map(p => disclaimerParas(p).slice(1))
    for (let i = 1; i < tails.length; i++) {
      expect(tails[i], `${ALL[i]} vs ${ALL[0]}`).toEqual(tails[0])
    }
  })

  it('3 paragraph 1 differs ONLY in the span before " purposes only."', () => {
    const MARKER = ' purposes only.'
    const suffixes = ALL.map(p => {
      const para = disclaimerParas(p)[0]
      const at = para.indexOf(MARKER)
      expect(at, `purpose ${p}: marker not found in paragraph 1`).toBeGreaterThan(0)
      return para.slice(at)
    })
    for (let i = 1; i < suffixes.length; i++) {
      expect(suffixes[i], `${ALL[i]} vs ${ALL[0]}`).toBe(suffixes[0])
    }
    // And the heads must genuinely differ, or the parameter is doing nothing.
    const heads = ALL.map(p => disclaimerParas(p)[0].split(MARKER)[0])
    expect(new Set(heads).size).toBe(ALL.length)
  })

  it('4 each purpose’s phrase actually appears in its paragraph 1', () => {
    for (const p of ALL) {
      expect(disclaimerParas(p)[0]).toContain(PURPOSE_PHRASE[p])
    }
    // The three surfaces this change exists for must NOT say "screening".
    expect(disclaimerParas('verification_support')[0]).not.toContain('screening')
    expect(disclaimerParas('disclosure_preparation')[0]).not.toContain('screening')
  })

  it('5 no empty or whitespace-only paragraph, for any purpose', () => {
    for (const p of ALL) {
      disclaimerParas(p).forEach((para, i) => {
        expect(para.trim().length, `${p} paragraph ${i + 1} is empty`).toBeGreaterThan(0)
      })
    }
  })

  it('6 every DisclaimerPurpose has a phrase — a new union member without one fails here', () => {
    // Derived guard. Adding a member to the union and forgetting PURPOSE_PHRASE would put
    // `undefined` into paragraph 1 of a legal notice, which reads as a sentence with a hole in it
    // and would ship silently: the template literal stringifies it rather than throwing.
    expect(Object.keys(PURPOSE_PHRASE).sort()).toEqual([...ALL].sort())
    for (const p of ALL) {
      expect(typeof PURPOSE_PHRASE[p]).toBe('string')
      expect(PURPOSE_PHRASE[p].trim().length).toBeGreaterThan(0)
      expect(disclaimerParas(p)[0]).not.toContain('undefined')
    }
  })
})
