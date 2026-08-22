import { describe, it, expect } from 'vitest'
import {
  parseFiscalYear, checkReportingPeriod, STANDARD_VERSIONS,
  type StandardVersion, type PeriodVersionCheck,
} from './materiality'

// ------------------------------------------------------------------------------------------------
// CHARACTERISATION TESTS. These describe what the code DOES today, not what it OUGHT to do.
//
// checkReportingPeriod and parseFiscalYear are about to be rewritten to take the DATE THE FINANCIAL
// YEAR BEGINS instead of an "FY####" label. The function's own header already says why:
//
//     THE RULE NEEDS A DATE THIS FIELD DOES NOT HOLD. Article 2 keys on the day the financial year
//     BEGINS. The field stores a label -- "FY2026" for a year beginning 1 April 2026 and one
//     beginning 1 December 2026 are different cases, and nothing here can tell them apart.
//
// So this file exists to make the rewrite PROVABLE: equivalent where it should be, different where
// it should be. Every test here is a statement about the present. A test that goes red after the
// rewrite is not automatically a regression -- it is a question to answer deliberately, and the
// comments below mark which ones are EXPECTED to change.
//
// TWO RULES FOLLOWED THROUGHOUT:
//   1. WHOLE SHAPE, NOT JUST STATUS. Every returned object is asserted across all five non-message
//      fields at once, and K1 pins the key set. A rewrite that silently adds, drops or repurposes a
//      field fails here rather than surfacing months later on a report cover.
//   2. MESSAGE CONTENT ONLY WHERE IT CARRIES A LOAD-BEARING FACT -- the year stated, and the legal
//      instrument named. Never a whole sentence: the prose will legitimately change when the field
//      becomes a date, and a test that pins wording would block the rewrite for no reason.
// ------------------------------------------------------------------------------------------------

/**
 * The five fields that are pure data. `message` is asserted separately and deliberately loosely --
 * see rule 2 above.
 */
function shapeOf(r: PeriodVersionCheck) {
  return {
    standardVersion: r.standardVersion,
    reportingPeriod: r.reportingPeriod,
    fiscalYear: r.fiscalYear,
    status: r.status,
    certainty: r.certainty,
  }
}

// ================================================================================================
// GROUP A -- parseFiscalYear: the shapes that parse
// ================================================================================================
describe('GROUP A -- parseFiscalYear accepts exactly two documented shapes', () => {
  it('A1 "FY2026" -- the shape the wizard emits', () => {
    expect(parseFiscalYear('FY2026')).toBe(2026)
  })

  it('A2 "FY 2026" -- ONE optional space is permitted by the regex', () => {
    expect(parseFiscalYear('FY 2026')).toBe(2026)
  })

  it('A3 "fy2026" -- case-insensitive', () => {
    expect(parseFiscalYear('fy2026')).toBe(2026)
  })

  it('A4 bare "2026" -- the second documented shape', () => {
    expect(parseFiscalYear('2026')).toBe(2026)
  })

  it('A5 surrounding whitespace is trimmed before matching', () => {
    // Not in the doc comment, but it is real behaviour an API caller can depend on today.
    expect(parseFiscalYear('  FY2026  ')).toBe(2026)
  })
})

// ================================================================================================
// GROUP B -- parseFiscalYear: everything else is null, on purpose
// ================================================================================================
describe('GROUP B -- parseFiscalYear rejects everything ambiguous', () => {
  // The three the doc comment names by hand as having "a defensible reading and a wrong one".
  it('B1 "2025/26" -- a split-year label is null, not 2025 and not 2026', () => {
    expect(parseFiscalYear('2025/26')).toBeNull()
  })

  it('B2 "H1 2026" -- a half-year is null even though a year is visibly present', () => {
    expect(parseFiscalYear('H1 2026')).toBeNull()
  })

  it('B3 "Year ended 31 March 2026" -- prose is null, though it is the ONLY form here that carries the date Article 2 actually needs', () => {
    // Worth naming: this input holds strictly MORE information than "FY2026" -- it states the day
    // the year ends, from which the day it begins follows -- and the current code discards it as
    // unreadable while accepting the vaguer label. That is not a defect in the parser (guessing at
    // free text is worse), but it is the clearest single argument for the date-column rewrite.
    expect(parseFiscalYear('Year ended 31 March 2026')).toBeNull()
  })

  it('B4 empty string is null', () => {
    expect(parseFiscalYear('')).toBeNull()
  })

  it('B5 whitespace-only is null -- it trims to empty', () => {
    expect(parseFiscalYear('  ')).toBeNull()
  })

  it('B6 "FY26" -- two digits do not satisfy \\d{4}', () => {
    expect(parseFiscalYear('FY26')).toBeNull()
  })

  it('B7 "FY20267" -- five digits do not either; the regex is anchored at both ends', () => {
    expect(parseFiscalYear('FY20267')).toBeNull()
  })

  it('B8 "FY  2026" -- TWO spaces fail where one succeeds', () => {
    // The regex is /^(?:FY[ ]?)?(\d{4})$/i -- a single optional space, not \s*. A double space is
    // therefore unparseable. I think this is arguably wrong: a customer who typed an extra space
    // gets "could not be checked" for a period that is perfectly readable, and A5 already proves
    // the function is willing to tolerate whitespace at the ends. Asserting it as-is; not fixing
    // it here, and it becomes moot once the input is a date column.
    expect(parseFiscalYear('FY  2026')).toBeNull()
  })
})

// ================================================================================================
// GROUP C -- parseFiscalYear: the plausibility window, both boundaries, both sides
// ================================================================================================
describe('GROUP C -- the 1990..2100 window is inclusive at both ends', () => {
  it('C1 1989 is outside -- null, NOT 1989', () => {
    expect(parseFiscalYear('FY1989')).toBeNull()
  })

  it('C2 1990 is inside -- the lower bound is inclusive', () => {
    expect(parseFiscalYear('FY1990')).toBe(1990)
  })

  it('C3 2100 is inside -- the upper bound is inclusive', () => {
    expect(parseFiscalYear('FY2100')).toBe(2100)
  })

  it('C4 2101 is outside -- null', () => {
    expect(parseFiscalYear('FY2101')).toBeNull()
  })
})

// ================================================================================================
// GROUP D -- parseFiscalYear: non-string inputs never throw
// ================================================================================================
describe('GROUP D -- non-string input is null, never a throw', () => {
  it('D1 null', () => {
    expect(parseFiscalYear(null)).toBeNull()
  })

  it('D2 undefined', () => {
    expect(parseFiscalYear(undefined)).toBeNull()
  })

  it('D3 a number -- 2026 as a NUMBER is null, though 2026 as a string parses', () => {
    // The typeof guard runs before anything else. Casting because the signature forbids it at
    // compile time; the guard exists precisely because JSON from an API caller does not.
    expect(parseFiscalYear(2026 as unknown as string)).toBeNull()
  })

  it('D4 a Date -- null, even though it holds the very datum the rewrite wants', () => {
    expect(parseFiscalYear(new Date('2026-01-01') as unknown as string)).toBeNull()
  })

  it('D5 an array', () => {
    expect(parseFiscalYear(['FY2026'] as unknown as string)).toBeNull()
  })
})

// ================================================================================================
// GROUP E -- checkReportingPeriod: not_stated, and the truthiness edge inside it
// ================================================================================================
describe('GROUP E -- not_stated is reached when EITHER input is absent', () => {
  it('E1 null standardVersion with a good period -- not_stated, and the period is still echoed back', () => {
    const r = checkReportingPeriod('FY2026', null)
    expect(shapeOf(r)).toEqual({
      standardVersion: null,
      reportingPeriod: 'FY2026',
      fiscalYear: null,   // NOT parsed -- the guard returns before parseFiscalYear runs
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E2 null period with a stated version -- not_stated', () => {
    const r = checkReportingPeriod(null, 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: null,
      fiscalYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E3 both null -- not_stated', () => {
    const r = checkReportingPeriod(null, null)
    expect(shapeOf(r)).toEqual({
      standardVersion: null,
      reportingPeriod: null,
      fiscalYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E4 EMPTY-STRING period is not_stated -- the guard is truthiness, not == null', () => {
    // `if (!standardVersion || !reportingPeriod)`. An empty string is falsy, so "" takes the same
    // exit as null and is reported as a field the user left alone. That is the right call today.
    // FLAGGING IT FOR THE REWRITE, not fixing it: if a client form ever sends "" for a half-filled
    // date pair, it will be silently classed as "not stated" rather than as a defect -- and the
    // both-or-neither CHECK constraint would not catch it either, because "" never reaches the DB
    // as a partial row. Whatever converts dates to this input must pass an explicit null.
    const r = checkReportingPeriod('', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: '',
      fiscalYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E5 WHITESPACE-ONLY period is NOT not_stated -- it is unparseable, the other side of E4', () => {
    // "  " is truthy, so it clears the guard, reaches parseFiscalYear, trims to "" and fails there.
    // Two visually identical blanks, two different statuses, and the report renders one of them
    // ("not stated") silently while the other is a finding. I think this split is wrong -- both are
    // "the user entered nothing" -- but it is what the code does, so it is what is asserted.
    const r = checkReportingPeriod('  ', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: '  ',
      fiscalYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toBeTruthy()
  })
})

// ================================================================================================
// GROUP F -- checkReportingPeriod: unparseable, for every standardVersion
// ================================================================================================
describe('GROUP F -- unparseable is reported as itself and never folded into ok', () => {
  it('F1 esrs_2023 with "2025/26"', () => {
    const r = checkReportingPeriod('2025/26', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: '2025/26',
      fiscalYear: null,
      status: 'unparseable',
      certainty: null,
    })
    // Load-bearing: the message quotes the value back, so the reader can see WHAT could not be
    // read. Content, not wording.
    expect(r.message).toContain('2025/26')
  })

  it('F2 esrs_2023_reliefs with "H1 2026"', () => {
    const r = checkReportingPeriod('H1 2026', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      reportingPeriod: 'H1 2026',
      fiscalYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toContain('H1 2026')
  })

  it('F3 esrs_2026 with "Year ended 31 March 2026"', () => {
    const r = checkReportingPeriod('Year ended 31 March 2026', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: 'Year ended 31 March 2026',
      fiscalYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toContain('Year ended 31 March 2026')
  })

  it('F4 an OUT-OF-WINDOW year is unparseable, not conflict -- "FY1989" under esrs_2026', () => {
    // 1989 is plainly less than 2026 and would satisfy the esrs_2026 conflict test if it reached
    // it. It does not: parseFiscalYear returns null for out-of-window years, so the function
    // reports "could not be read" rather than "disagrees with the version". Both are honest; they
    // are different findings, and this is the one it makes today.
    const r = checkReportingPeriod('FY1989', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: 'FY1989',
      fiscalYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toContain('FY1989')
  })
})

// ================================================================================================
// GROUP G -- conflict: esrs_2026 below the early-adoption floor
// ================================================================================================
describe('GROUP G -- esrs_2026 conflicts below FY2026, certainty explicit', () => {
  it('G1 FY2025 -- conflict, explicit', () => {
    const r = checkReportingPeriod('FY2025', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: 'FY2025',
      fiscalYear: 2025,
      status: 'conflict',
      certainty: 'explicit',
    })
    // The two facts that must survive the rewrite: the year stated, and the standard named.
    expect(r.message).toContain('2025')
    expect(r.message).toContain('ESRS (2026)')
  })

  it('G2 FY1990 -- the far side of the same branch', () => {
    const r = checkReportingPeriod('FY1990', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: 'FY1990',
      fiscalYear: 1990,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('1990')
  })

  it('G3 bare "2025" reaches the same verdict as "FY2025" -- the label form does not change the finding', () => {
    const bare = checkReportingPeriod('2025', 'esrs_2026')
    const prefixed = checkReportingPeriod('FY2025', 'esrs_2026')
    expect(bare.status).toBe(prefixed.status)
    expect(bare.certainty).toBe(prefixed.certainty)
    expect(bare.fiscalYear).toBe(prefixed.fiscalYear)
    // Only the echoed raw input differs, and it differs because it should.
    expect(bare.reportingPeriod).toBe('2025')
    expect(prefixed.reportingPeriod).toBe('FY2025')
  })
})

// ================================================================================================
// GROUP H -- conflict: esrs_2023_reliefs, which is a single-year option, so BOTH sides conflict
// ================================================================================================
describe('GROUP H -- esrs_2023_reliefs conflicts on either side of FY2026, certainty inferred', () => {
  it('H1 FY2025 -- below', () => {
    const r = checkReportingPeriod('FY2025', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      reportingPeriod: 'FY2025',
      fiscalYear: 2025,
      status: 'conflict',
      certainty: 'inferred',
    })
    expect(r.message).toContain('2025')
    // 'inferred' exists because this is read off the SCOPE of Article 2(1), not a prohibition in
    // terms -- and the report prints an extra sentence keyed on that value. Naming the article is
    // the fact that must survive; the sentence around it is free to change.
    expect(r.message).toContain('Article 2(1)')
  })

  it('H2 FY2027 -- above. The ONLY standardVersion whose conflict test is != rather than a range', () => {
    const r = checkReportingPeriod('FY2027', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      reportingPeriod: 'FY2027',
      fiscalYear: 2027,
      status: 'conflict',
      certainty: 'inferred',
    })
    expect(r.message).toContain('2027')
    expect(r.message).toContain('Article 2(1)')
  })
})

// ================================================================================================
// GROUP I -- conflict: esrs_2023 above FY2026
// ================================================================================================
describe('GROUP I -- esrs_2023 conflicts above FY2026, certainty explicit', () => {
  it('I1 FY2027 -- conflict, explicit', () => {
    const r = checkReportingPeriod('FY2027', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: 'FY2027',
      fiscalYear: 2027,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('ESRS (2023)')
  })

  it('I2 FY2100 -- the far side, where the stated year is unambiguous in the message', () => {
    const r = checkReportingPeriod('FY2100', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: 'FY2100',
      fiscalYear: 2100,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('2100')
    expect(r.message).toContain('ESRS (2023)')
  })
})

// ================================================================================================
// GROUP J -- ok, every standardVersion, boundaries included
//
// FY2026 is the hinge year: it is the ONLY year in which all three versions are non-conflicting,
// and each of the three reaches that verdict through a different comparison. If the rewrite gets
// one boundary wrong, it shows up here.
// ================================================================================================
describe('GROUP J -- ok, with FY2026 as the three-way hinge', () => {
  it('J1 esrs_2026 at exactly FY2026 -- the early-adoption boundary, inclusive', () => {
    const r = checkReportingPeriod('FY2026', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: 'FY2026',
      fiscalYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J2 esrs_2026 at FY2027 -- the year it is required for', () => {
    const r = checkReportingPeriod('FY2027', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      reportingPeriod: 'FY2027',
      fiscalYear: 2027,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J3 esrs_2023_reliefs at exactly FY2026 -- its only non-conflicting year', () => {
    const r = checkReportingPeriod('FY2026', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      reportingPeriod: 'FY2026',
      fiscalYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J4 esrs_2023 at exactly FY2026 -- the upper boundary, inclusive', () => {
    const r = checkReportingPeriod('FY2026', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: 'FY2026',
      fiscalYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J5 esrs_2023 at FY2025', () => {
    const r = checkReportingPeriod('FY2025', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: 'FY2025',
      fiscalYear: 2025,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J6 esrs_2023 at FY1990 -- ok, at the bottom of the plausibility window', () => {
    // No lower bound is tested for esrs_2023, so a 1990 period under the 2023 standards is 'ok'.
    // Only parseFiscalYear stops it going further back. Asserting as-is.
    const r = checkReportingPeriod('FY1990', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      reportingPeriod: 'FY1990',
      fiscalYear: 1990,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })
})

// ================================================================================================
// GROUP K -- shape guards. These are the ones that make the rewrite provable.
// ================================================================================================
describe('GROUP K -- the returned record, and coverage of the version enum', () => {
  it('K1 the key set is exactly the six documented fields, in every status', () => {
    // The whole point of characterising: a rewrite that adds a seventh field (say a parsed start
    // date) or drops fiscalYear must announce itself here rather than on a report cover.
    const EXPECTED = ['certainty', 'fiscalYear', 'message', 'reportingPeriod', 'standardVersion', 'status']
    const samples: PeriodVersionCheck[] = [
      checkReportingPeriod(null, null),                          // not_stated
      checkReportingPeriod('H1 2026', 'esrs_2026'),              // unparseable
      checkReportingPeriod('FY2025', 'esrs_2026'),               // conflict / explicit
      checkReportingPeriod('FY2027', 'esrs_2023_reliefs'),       // conflict / inferred
      checkReportingPeriod('FY2026', 'esrs_2023'),               // ok
    ]
    for (const s of samples) expect(Object.keys(s).sort()).toEqual(EXPECTED)
  })

  it('K2 reportingPeriod is echoed RAW -- never trimmed or normalised, even when the parse trimmed it', () => {
    // parseFiscalYear trims internally (A5), but the record keeps what the undertaking supplied.
    // That is the methodology rule about verbatim source values, and it must survive the rewrite:
    // whatever the field becomes, the record states what was given, not a cleaned-up version.
    const r = checkReportingPeriod('  FY2026  ', 'esrs_2026')
    expect(r.reportingPeriod).toBe('  FY2026  ')
    expect(r.fiscalYear).toBe(2026)
    expect(r.status).toBe('ok')
  })

  it('K3 every member of STANDARD_VERSIONS is characterised above -- a fourth version fails this test', () => {
    // Derived guard, in the style of the LEGACY_PRICING_PAGE_ID test: adding a standard version
    // without deciding how it pairs with a reporting period would otherwise be silent, and the
    // silent outcome is 'ok' -- the branch chain falls through to it.
    expect([...STANDARD_VERSIONS].sort()).toEqual(['esrs_2023', 'esrs_2023_reliefs', 'esrs_2026'])

    // And none of them throws on any status path.
    for (const v of STANDARD_VERSIONS as readonly StandardVersion[]) {
      expect(() => checkReportingPeriod(null, v)).not.toThrow()
      expect(() => checkReportingPeriod('nonsense', v)).not.toThrow()
      expect(() => checkReportingPeriod('FY2026', v)).not.toThrow()
    }
  })
})
