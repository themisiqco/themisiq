import { describe, it, expect } from 'vitest'
import { finalisationStamp, type FinalisationLatest } from './finalisation'

// ------------------------------------------------------------------------------------------------
// The finalise card's status line. Small, but it has the one branch on this surface that a later
// "tidy-up" would plausibly flatten — version 1 reading differently from version 2 — and the one
// fallback that must not be simplified into dropping the line.
//
// ⚠️ WHAT THESE TESTS CANNOT COVER, said plainly: that the card never recomputes `ready`. No unit
// test can assert the ABSENCE of a computation. That guard is the comment on Readiness in
// finalisation.ts and a reviewer rejecting `outstanding_count === 0`.
// ------------------------------------------------------------------------------------------------

const at = (iso: string, version = 1): FinalisationLatest =>
  ({ version, finalised_at: iso, standard_version: 'esrs_2026' })

describe('finalisationStamp', () => {
  it('1 version 1 reads "Finalised <date>" — no version number', () => {
    // A single finalisation is just finalised. Printing "Version 1" invites the reader to wonder
    // what the other versions are, and there are none.
    expect(finalisationStamp(at('2026-08-22T09:14:00.000Z')))
      .toBe('Finalised 22 August 2026')
  })

  it('2 version 2 reads "Version 2 · finalised <date>"', () => {
    expect(finalisationStamp(at('2026-09-05T16:40:00.000Z', 2)))
      .toBe('Version 2 · finalised 5 September 2026')
  })

  it('3 no latest returns NULL, never "" and never a stub', () => {
    // '' would render an empty chip; a "Version 0" stub would say the assessment was finalised.
    // "Never finalised" and "finalised as version 0" are different facts.
    expect(finalisationStamp(null)).toBeNull()
    expect(finalisationStamp(undefined)).toBeNull()
  })

  it('4 the version number appears only above 1, whatever the number is', () => {
    expect(finalisationStamp(at('2026-08-22T00:00:00.000Z', 3)))
      .toBe('Version 3 · finalised 22 August 2026')
    expect(finalisationStamp(at('2026-08-22T00:00:00.000Z', 11)))
      .toBe('Version 11 · finalised 22 August 2026')
    expect(finalisationStamp(at('2026-08-22T00:00:00.000Z', 1)))
      .not.toContain('Version')
  })

  it('5 an unreadable date does NOT suppress the stamp — it prints raw', () => {
    // Dropping the line would hide that the assessment WAS finalised, which is the more important
    // of the two things being said. A wrong-looking date is reportable; a missing chip reads as
    // "never finalised".
    const out = finalisationStamp(at('not a date'))
    expect(out).toBe('Finalised not a date')
    expect(out).not.toBeNull()
  })

  it('6 a malformed latest without a numeric version returns null rather than "Finalised undefined"', () => {
    expect(finalisationStamp({ version: undefined, finalised_at: '2026-08-22',
                               standard_version: null } as unknown as FinalisationLatest)).toBeNull()
  })

  it('7 reads the timestamp in UTC, so one record does not stamp two dates on two machines', () => {
    // 23:30 UTC is already the next day east of UTC. formatReportDate pins UTC; this asserts the
    // stamp inherits that rather than re-deriving a local date.
    expect(finalisationStamp(at('2026-08-22T23:30:00.000Z'))).toBe('Finalised 22 August 2026')
    expect(finalisationStamp(at('2026-08-22T00:30:00.000Z'))).toBe('Finalised 22 August 2026')
  })
})
