import { describe, it, expect } from 'vitest'
import { DISCLAIMER_PARAS } from './disclaimer'

// This text is the platform's legal position and now has exactly ONE copy, so nothing else in the
// repo would notice if a paragraph were dropped, blanked, or truncated in an unrelated edit.
// Before the extraction, four byte-identical copies at least made a silent single-copy edit
// visible by divergence; that redundancy is gone, and these assertions replace it.

describe('DISCLAIMER_PARAS', () => {
  it('has exactly six paragraphs — a silent truncation must fail here', () => {
    expect(DISCLAIMER_PARAS).toHaveLength(6)
  })

  it('has no empty or whitespace-only paragraph', () => {
    DISCLAIMER_PARAS.forEach((para, i) => {
      expect(para.trim().length, `paragraph ${i + 1} is empty`).toBeGreaterThan(0)
    })
  })
})
