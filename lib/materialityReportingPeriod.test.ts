import { describe, it, expect } from 'vitest'
import {
  periodStartYear, checkReportingPeriod, STANDARD_VERSIONS,
  type StandardVersion, type PeriodVersionCheck,
} from './materiality'

// ------------------------------------------------------------------------------------------------
// REPORTING PERIOD vs ESRS VERSION -- the check, keyed on THE DAY THE FINANCIAL YEAR BEGINS.
//
// This file began on 21 Aug 2026 as pure characterisation of the FY-label parse that preceded this
// one. It is now the spec for the date-keyed check, and it keeps the old verdict beside the new one
// wherever the two differ -- because the whole point of characterising first was to be able to say
// which changes were intended. Every such test carries a WAS: line. There are eleven of them.
//
// WHY THE INPUT CHANGED. Article 3 of C(2026) 5010 applies the revised standards to financial years
// BEGINNING on or after 1 January 2027 (docs/reference/source/main-act.txt:489), and Article 2's
// transitional option is scoped to years STARTING in calendar 2026 (main-act.txt:444-446). Both key
// on the day the year begins, and a label cannot express it. The failing case, now pinned as L1:
//
//     A UK undertaking whose financial year runs 1 April 2026 to 31 March 2027 calls that year
//     "FY2027", by the commonest UK convention. The label parse read 2027, and the Article 2(1)
//     transitional option -- offered for years BEGINNING in calendar 2026 -- was reported as
//     CONFLICTING when it in fact applied. A wrong verdict on the report's face, with nothing
//     erroring anywhere.
//
// TWO RULES FOLLOWED THROUGHOUT, carried over from the characterisation pass:
//   1. WHOLE SHAPE, NOT JUST STATUS. Every returned object is asserted across all six non-message
//      fields at once, and K1 pins the key set. A change that silently adds, drops or repurposes a
//      field fails here rather than surfacing months later on a report cover. K1 is why the six-to-
//      seven key change had to be announced rather than discovered.
//   2. MESSAGE CONTENT ONLY WHERE IT CARRIES A LOAD-BEARING FACT -- the date stated, and the legal
//      instrument named. Never a whole sentence: the prose is free to change, and a test that pinned
//      wording would block a legitimate edit for no reason.
//
// WHERE THE CURRENT BEHAVIOUR STILL LOOKS WRONG TO ME it is asserted as-is with the objection in a
// comment, not fixed here. See B5 and L3.
// ------------------------------------------------------------------------------------------------

/**
 * The six fields that are pure data. `message` is asserted separately and deliberately loosely --
 * see rule 2 above.
 */
function shapeOf(r: PeriodVersionCheck) {
  return {
    standardVersion: r.standardVersion,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    startYear: r.startYear,
    status: r.status,
    certainty: r.certainty,
  }
}

// ================================================================================================
// GROUP A -- periodStartYear: the one shape that parses
// ================================================================================================
describe('GROUP A -- periodStartYear accepts an ISO calendar date and returns the year it begins in', () => {
  it('A1 "2026-01-01" -- a calendar-year undertaking', () => {
    expect(periodStartYear('2026-01-01')).toBe(2026)
  })

  it('A2 "2026-04-01" -- the UK April year. The MONTH DOES NOT MOVE THE YEAR, which is the point', () => {
    // WAS: "FY2027" for this same financial year, parsed as 2027. See L1 for the verdict that fixes.
    expect(periodStartYear('2026-04-01')).toBe(2026)
  })

  it('A3 "2026-12-31" -- a year beginning on the last day of the calendar year still begins in it', () => {
    expect(periodStartYear('2026-12-31')).toBe(2026)
  })

  it('A4 surrounding whitespace is trimmed before matching', () => {
    expect(periodStartYear('  2026-01-01  ')).toBe(2026)
  })

  it('A5 "2028-02-29" -- a real leap day is accepted', () => {
    expect(periodStartYear('2028-02-29')).toBe(2028)
  })
})

// ================================================================================================
// GROUP B -- periodStartYear: everything else is null
// ================================================================================================
describe('GROUP B -- periodStartYear rejects everything that is not a calendar date', () => {
  it('B1 "FY2026" -- THE OLD ACCEPTED FORM IS NOW REJECTED', () => {
    // WAS: 2026. This is the clean break. A label cannot say which calendar year the financial
    // year begins in (A2), so it is no longer an input this function will act on. Any caller still
    // sending a label gets 'unparseable' from checkReportingPeriod, never a guessed verdict.
    expect(periodStartYear('FY2026')).toBeNull()
  })

  it('B2 bare "2026" -- also the old accepted form, also now rejected', () => {
    // WAS: 2026.
    expect(periodStartYear('2026')).toBeNull()
  })

  it('B3 "2025/26" -- a split-year label', () => {
    // Verdict unchanged from the label parse: still null, now for not being a date at all.
    expect(periodStartYear('2025/26')).toBeNull()
  })

  it('B4 "H1 2026" -- a half-year', () => {
    expect(periodStartYear('H1 2026')).toBeNull()
  })

  it('B5 "Year ended 31 March 2026" -- prose, still rejected, and still the input that holds the MOST information', () => {
    // Carried forward from the characterisation pass, and it is worth restating now that the
    // function takes a date: this string states the day the year ENDS, from which the day it
    // begins follows. It is rejected while "2026-04-01" is accepted -- correctly, because guessing
    // at free text is worse than refusing it, but the observation has simply MOVED rather than
    // been resolved. It is now a question for the capture UI, whose job is to produce a date.
    expect(periodStartYear('Year ended 31 March 2026')).toBeNull()
  })

  it('B6 empty string is null', () => {
    expect(periodStartYear('')).toBeNull()
  })

  it('B7 whitespace-only is null -- it trims to empty', () => {
    expect(periodStartYear('  ')).toBeNull()
  })

  it('B8 "2026-1-1" -- unpadded components are rejected; the pattern requires two digits', () => {
    // Strict rather than lenient on purpose. A caller sending unpadded components is not sending
    // what a Postgres date column renders, and accepting one dialect quietly invites the next.
    expect(periodStartYear('2026-1-1')).toBeNull()
  })

  it('B9 "2026-13-01" -- month 13 is refused, NOT rolled forward into 2027', () => {
    expect(periodStartYear('2026-13-01')).toBeNull()
  })

  it('B10 "2026-02-30" -- an impossible day is REFUSED, not rolled forward to 2 March', () => {
    // This is what the Date.UTC round-trip buys. `new Date("2026-02-30")` yields 2 March in some
    // engines, which would silently assert a day the undertaking never stated -- a plausible wrong
    // answer, which is the failure mode this codebase treats as worse than a refusal.
    expect(periodStartYear('2026-02-30')).toBeNull()
  })
})

// ================================================================================================
// GROUP C -- the plausibility window is GONE. A date validates itself.
//
// All four of these change. The old parser clamped to 1990..2100 and returned null outside it, so
// an implausible-but-real day was reported as UNREADABLE. It is readable; it is just early or late,
// and the rule can say so. See G2 for the verdict this unlocks.
// ================================================================================================
describe('GROUP C -- no plausibility window: any real date parses', () => {
  it('C1 "1989-01-01" parses as 1989', () => {
    // WAS: null, because 1989 < 1990. That refusal is what made old-F4 report the weaker finding.
    expect(periodStartYear('1989-01-01')).toBe(1989)
  })

  it('C2 "1990-01-01" parses as 1990', () => {
    // WAS: 1990 also -- it sat exactly on the old lower bound. Unchanged, kept as the control.
    expect(periodStartYear('1990-01-01')).toBe(1990)
  })

  it('C3 "2100-01-01" parses as 2100', () => {
    // WAS: 2100 also -- exactly on the old upper bound. Unchanged, kept as the control.
    expect(periodStartYear('2100-01-01')).toBe(2100)
  })

  it('C4 "2101-01-01" parses as 2101', () => {
    // WAS: null, because 2101 > 2100.
    expect(periodStartYear('2101-01-01')).toBe(2101)
  })
})

// ================================================================================================
// GROUP D -- non-string inputs never throw
// ================================================================================================
describe('GROUP D -- non-string input is null, never a throw', () => {
  it('D1 null', () => {
    expect(periodStartYear(null)).toBeNull()
  })

  it('D2 undefined', () => {
    expect(periodStartYear(undefined)).toBeNull()
  })

  it('D3 a number', () => {
    // Casting because the signature forbids it at compile time; the guard exists precisely because
    // JSON from an API caller does not.
    expect(periodStartYear(2026 as unknown as string)).toBeNull()
  })

  it('D4 a Date object -- null, even though it is the very type the value denotes', () => {
    // Deliberate. The record echoes what was SUPPLIED, verbatim (K2), and a Date has no verbatim
    // form -- serialising it here would put a string in the record the caller never sent.
    expect(periodStartYear(new Date('2026-01-01') as unknown as string)).toBeNull()
  })

  it('D5 an array', () => {
    expect(periodStartYear(['2026-01-01'] as unknown as string)).toBeNull()
  })
})

// ================================================================================================
// GROUP E -- not_stated, and the seam that used to sit inside it
// ================================================================================================
describe('GROUP E -- not_stated is reached when EITHER the version or the start is absent', () => {
  it('E1 null standardVersion with a good start -- not_stated, and both dates still echoed back', () => {
    const r = checkReportingPeriod('2026-01-01', '2026-12-31', null)
    expect(shapeOf(r)).toEqual({
      standardVersion: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      startYear: null,   // NOT parsed -- the guard returns before periodStartYear runs
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E2 null start with a stated version -- not_stated', () => {
    const r = checkReportingPeriod(null, null, 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: null,
      periodEnd: null,
      startYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E3 both null -- not_stated', () => {
    const r = checkReportingPeriod(null, null, null)
    expect(shapeOf(r)).toEqual({
      standardVersion: null,
      periodStart: null,
      periodEnd: null,
      startYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E4 EMPTY-STRING start is not_stated', () => {
    const r = checkReportingPeriod('', null, 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '',
      periodEnd: null,
      startYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('E5 WHITESPACE-ONLY start is ALSO not_stated -- the seam is closed', () => {
    // WAS: 'unparseable'. The old guard was bare truthiness on the string, so "" exited as
    // not_stated while "  " cleared the guard, reached the parser and came back unparseable. Two
    // visually identical blanks, two different statuses, and the report renders one of them
    // silently while the other is a finding. E4 and E5 now agree, which is the whole fix.
    //
    // Callers should still pass an explicit null. This is the floor, not the contract -- what it
    // guarantees is that a half-filled date form can never read as a deliberate abstention.
    const r = checkReportingPeriod('  ', null, 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '  ',
      periodEnd: null,
      startYear: null,
      status: 'not_stated',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })
})

// ================================================================================================
// GROUP F -- unparseable: NARROWER THAN IT WAS, and still not folded into anything
//
// It now means one thing only: periodStart is not a calendar date. It no longer covers a date that
// is merely implausible -- that moved to 'conflict', where the rule can actually decide it (G2).
// ================================================================================================
describe('GROUP F -- unparseable is reported as itself, never as ok and never as conflict', () => {
  it('F1 esrs_2023 with "2025/26"', () => {
    const r = checkReportingPeriod('2025/26', null, 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: '2025/26',
      periodEnd: null,
      startYear: null,
      status: 'unparseable',
      certainty: null,
    })
    // Load-bearing: the message quotes the value back, so a reader can see WHAT could not be read.
    expect(r.message).toContain('2025/26')
  })

  it('F2 esrs_2023_reliefs with "H1 2026"', () => {
    const r = checkReportingPeriod('H1 2026', null, 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      periodStart: 'H1 2026',
      periodEnd: null,
      startYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toContain('H1 2026')
  })

  it('F3 esrs_2026 with "Year ended 31 March 2026"', () => {
    const r = checkReportingPeriod('Year ended 31 March 2026', null, 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: 'Year ended 31 March 2026',
      periodEnd: null,
      startYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toContain('Year ended 31 March 2026')
  })

  it('F4 "FY2026" -- THE OLD INPUT FORM IS NOW UNPARSEABLE, and says so rather than guessing', () => {
    // WAS: 'ok' under esrs_2026. The most important test in this group: a caller that was not
    // updated alongside the signature does not get a silently-wrong verdict, it gets a stated
    // refusal naming the value it sent. That is the difference between a caught migration and a
    // report asserting a period nobody checked.
    const r = checkReportingPeriod('FY2026', null, 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: 'FY2026',
      periodEnd: null,
      startYear: null,
      status: 'unparseable',
      certainty: null,
    })
    expect(r.message).toContain('FY2026')
  })
})

// ================================================================================================
// GROUP G -- conflict: esrs_2026, for a year beginning before 1 January 2026
// ================================================================================================
describe('GROUP G -- esrs_2026 conflicts below 1 January 2026, certainty explicit', () => {
  it('G1 begins 2025-01-01 -- conflict, explicit', () => {
    const r = checkReportingPeriod('2025-01-01', '2025-12-31', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      startYear: 2025,
      status: 'conflict',
      certainty: 'explicit',
    })
    // The two facts that must survive any rewording: the date stated, and the standard named.
    expect(r.message).toContain('2025-01-01')
    expect(r.message).toContain('ESRS (2026)')
  })

  it('G2 begins 1989-04-01 -- CONFLICT, not "could not be read". This is the finding that was being withheld', () => {
    // WAS: 'unparseable', because 1989 fell outside the parser's 1990..2100 plausibility window.
    // The rule can decide this perfectly well -- a year beginning in 1989 plainly begins before
    // 1 January 2026 -- and reporting "we could not read it" was the weaker of two available
    // findings, made only because the parse threw the value away before the rule ever saw it.
    // Deleting the window (GROUP C) is what lets the rule speak.
    const r = checkReportingPeriod('1989-04-01', null, 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '1989-04-01',
      periodEnd: null,
      startYear: 1989,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('1989-04-01')
    expect(r.message).toContain('ESRS (2026)')
  })

  it('G3 begins 2025-12-31 -- the last day that conflicts, one day before early adoption opens', () => {
    const r = checkReportingPeriod('2025-12-31', '2026-12-30', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '2025-12-31',
      periodEnd: '2026-12-30',
      startYear: 2025,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('2025-12-31')
  })
})

// ================================================================================================
// GROUP H -- conflict: esrs_2023_reliefs, a single-calendar-year option, so BOTH sides conflict
//
// certainty is 'inferred' throughout, and the distinction is deliberate. Article 3 states a limit
// about the instrument IN TERMS (main-act.txt:489), which is why G and I are 'explicit'. Article
// 2(1) instead CONFERS A PERMISSION over a stated range (main-act.txt:444-446) and says nothing
// about a year outside it -- the exclusion follows from the grant not reaching that year, not from
// a prohibition. The report prints an extra sentence keyed on this value, so it must be right.
// ================================================================================================
describe('GROUP H -- esrs_2023_reliefs conflicts on either side of calendar 2026, certainty inferred', () => {
  it('H1 begins 2025-12-31 -- one day before the window opens', () => {
    const r = checkReportingPeriod('2025-12-31', '2026-12-30', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      periodStart: '2025-12-31',
      periodEnd: '2026-12-30',
      startYear: 2025,
      status: 'conflict',
      certainty: 'inferred',
    })
    expect(r.message).toContain('2025-12-31')
    // Naming the article is the fact that must survive; the sentence around it is free to change.
    expect(r.message).toContain('Article 2(1)')
  })

  it('H2 begins 2027-01-01 -- one day after it closes. The ONLY rule tested with != rather than a range', () => {
    const r = checkReportingPeriod('2027-01-01', '2027-12-31', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      periodStart: '2027-01-01',
      periodEnd: '2027-12-31',
      startYear: 2027,
      status: 'conflict',
      certainty: 'inferred',
    })
    expect(r.message).toContain('2027-01-01')
    expect(r.message).toContain('Article 2(1)')
  })
})

// ================================================================================================
// GROUP I -- conflict: esrs_2023, for a year beginning on or after 1 January 2027
// ================================================================================================
describe('GROUP I -- esrs_2023 conflicts from 1 January 2027, certainty explicit', () => {
  it('I1 begins 2027-01-01 -- the first day that conflicts', () => {
    const r = checkReportingPeriod('2027-01-01', '2027-12-31', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: '2027-01-01',
      periodEnd: '2027-12-31',
      startYear: 2027,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('2027-01-01')
    expect(r.message).toContain('ESRS (2023)')
  })

  it('I2 begins 2100-06-30 -- the far side of the same branch', () => {
    const r = checkReportingPeriod('2100-06-30', null, 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: '2100-06-30',
      periodEnd: null,
      startYear: 2100,
      status: 'conflict',
      certainty: 'explicit',
    })
    expect(r.message).toContain('2100-06-30')
    expect(r.message).toContain('ESRS (2023)')
  })
})

// ================================================================================================
// GROUP J -- ok, at the exact boundary DAYS
//
// Calendar 2026 is the hinge: it is the only year in which all three versions are non-conflicting,
// and each reaches that verdict through a different comparison (<, !==, >). If a boundary is ever
// got wrong by one day, it shows up here rather than on a report.
// ================================================================================================
describe('GROUP J -- ok, with calendar 2026 as the three-way hinge', () => {
  it('J1 esrs_2026, begins 2026-01-01 -- the first day of early adoption', () => {
    const r = checkReportingPeriod('2026-01-01', '2026-12-31', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      startYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J2 esrs_2026, begins 2026-12-31 -- the last day of early adoption', () => {
    const r = checkReportingPeriod('2026-12-31', '2027-12-30', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '2026-12-31',
      periodEnd: '2027-12-30',
      startYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J3 esrs_2026, begins 2027-01-01 -- the first day it is required rather than permitted', () => {
    const r = checkReportingPeriod('2027-01-01', '2027-12-31', 'esrs_2026')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2026',
      periodStart: '2027-01-01',
      periodEnd: '2027-12-31',
      startYear: 2027,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J4 esrs_2023_reliefs, begins 2026-01-01 -- the first day of its only window', () => {
    const r = checkReportingPeriod('2026-01-01', '2026-12-31', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      startYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J5 esrs_2023_reliefs, begins 2026-12-31 -- the last day of it', () => {
    const r = checkReportingPeriod('2026-12-31', '2027-12-30', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      periodStart: '2026-12-31',
      periodEnd: '2027-12-30',
      startYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J6 esrs_2023, begins 2026-12-31 -- the last day before the revised standards take over', () => {
    const r = checkReportingPeriod('2026-12-31', '2027-12-30', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: '2026-12-31',
      periodEnd: '2027-12-30',
      startYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('J7 esrs_2023, begins 1990-01-01 -- ok, because this act states no lower bound. See L3', () => {
    const r = checkReportingPeriod('1990-01-01', '1990-12-31', 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: '1990-01-01',
      periodEnd: '1990-12-31',
      startYear: 1990,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })
})

// ================================================================================================
// GROUP K -- the returned record itself
// ================================================================================================
describe('GROUP K -- shape, verbatim echo, and coverage of the version enum', () => {
  it('K1 the key set is exactly SEVEN fields, in every status', () => {
    // CHANGED, and the change was announced before it was made: six keys became seven when
    // reportingPeriod + fiscalYear became periodStart + periodEnd + startYear. This test existing
    // is why that had to be a decision rather than a discovery, and it goes on serving the same
    // purpose -- an eighth field, or a quietly dropped startYear, fails here.
    const EXPECTED = [
      'certainty', 'message', 'periodEnd', 'periodStart', 'standardVersion', 'startYear', 'status',
    ]
    const samples: PeriodVersionCheck[] = [
      checkReportingPeriod(null, null, null),                                 // not_stated
      checkReportingPeriod('H1 2026', null, 'esrs_2026'),                     // unparseable
      checkReportingPeriod('2025-01-01', '2025-12-31', 'esrs_2026'),          // conflict / explicit
      checkReportingPeriod('2027-01-01', '2027-12-31', 'esrs_2023_reliefs'),  // conflict / inferred
      checkReportingPeriod('2026-01-01', '2026-12-31', 'esrs_2023'),          // ok
    ]
    for (const s of samples) expect(Object.keys(s).sort()).toEqual(EXPECTED)
  })

  it('K2 BOTH dates are echoed RAW -- never trimmed, never reformatted, even when the parse trimmed', () => {
    // Unchanged in principle and now covering two fields instead of one. periodStartYear trims
    // internally (A4), but the record keeps what the undertaking supplied. That is the methodology
    // rule about verbatim source values, and it is the behaviour that had to survive the rewrite
    // untouched: the record states what was given, never a cleaned-up version of it.
    const r = checkReportingPeriod('  2026-01-01  ', '  2026-12-31  ', 'esrs_2026')
    expect(r.periodStart).toBe('  2026-01-01  ')
    expect(r.periodEnd).toBe('  2026-12-31  ')
    expect(r.startYear).toBe(2026)
    expect(r.status).toBe('ok')
  })

  it('K3 every member of STANDARD_VERSIONS is characterised above -- a fourth version fails this test', () => {
    // Derived guard, in the style of the LEGACY_PRICING_PAGE_ID test: adding a standard version
    // without deciding how it pairs with a reporting period would otherwise be silent, and the
    // silent outcome is 'ok' -- the branch chain falls through to it.
    expect([...STANDARD_VERSIONS].sort()).toEqual(['esrs_2023', 'esrs_2023_reliefs', 'esrs_2026'])

    // And none of them throws on any status path.
    for (const v of STANDARD_VERSIONS as readonly StandardVersion[]) {
      expect(() => checkReportingPeriod(null, null, v)).not.toThrow()
      expect(() => checkReportingPeriod('nonsense', 'nonsense', v)).not.toThrow()
      expect(() => checkReportingPeriod('2026-01-01', '2026-12-31', v)).not.toThrow()
    }
  })

  it('K4 periodEnd is CARRIED BUT NEVER CONSULTED -- the verdict is identical whatever it holds', () => {
    // NEW, with no predecessor. No rule in Articles 2 or 3 reads the end date, and the
    // both-or-neither and end > start CHECK constraints on materiality_assessments (migration
    // 20260846) are the authority on whether the pair is coherent. This pins that contract so a
    // later edit cannot start reading periodEnd here -- putting a second, weaker opinion next to
    // the constraint -- without a test going red.
    const withNull = checkReportingPeriod('2025-01-01', null, 'esrs_2026')
    const withEnd = checkReportingPeriod('2025-01-01', '2025-12-31', 'esrs_2026')
    const withNonsense = checkReportingPeriod('2025-01-01', 'not a date at all', 'esrs_2026')
    for (const r of [withEnd, withNonsense]) {
      expect(r.status).toBe(withNull.status)
      expect(r.certainty).toBe(withNull.certainty)
      expect(r.startYear).toBe(withNull.startYear)
      expect(r.message).toBe(withNull.message)
    }
    // Only the echo differs, and it differs because it should.
    expect(withNull.periodEnd).toBeNull()
    expect(withEnd.periodEnd).toBe('2025-12-31')
    expect(withNonsense.periodEnd).toBe('not a date at all')
  })
})

// ================================================================================================
// GROUP L -- THE REGRESSION THIS REWRITE EXISTS TO FIX
//
// Everything above says the new code is coherent. This group says it is CORRECT where the old code
// was wrong, and it is the reason the change was worth making.
// ================================================================================================
describe('GROUP L -- a financial year that does not start in January', () => {
  it('L1 UK year 1 Apr 2026 to 31 Mar 2027 under the reliefs -- OK. The old code called this a conflict', () => {
    // WAS: 'conflict' / 'inferred'.
    //
    // By the commonest UK convention this financial year is called "FY2027". The label parse read
    // 2027, compared it against the reliefs' single permitted year of 2026, and reported a conflict
    // on the report's face -- for an undertaking squarely inside the Article 2(1) grant, which runs
    // to years "starting between 1 January 2026 and 31 December 2026" (main-act.txt:444). Nothing
    // errored. No test went red. The verdict was simply wrong, and it was wrong for every
    // April-year undertaking in the UK.
    const r = checkReportingPeriod('2026-04-01', '2027-03-31', 'esrs_2023_reliefs')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023_reliefs',
      periodStart: '2026-04-01',
      periodEnd: '2027-03-31',
      startYear: 2026,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })

  it('L2 two years beginning in the same calendar year, nine months apart, get the SAME verdict', () => {
    // The header's own worked example, now executable: "FY2026 for a year beginning 1 April 2026
    // and one beginning 1 December 2026 are different cases, and nothing here can tell them apart."
    // They are the same case for Articles 2 and 3, which key on the calendar year the year BEGINS
    // in -- and the date says which that is, where the label could not.
    const april = checkReportingPeriod('2026-04-01', '2027-03-31', 'esrs_2023_reliefs')
    const december = checkReportingPeriod('2026-12-01', '2027-11-30', 'esrs_2023_reliefs')
    expect(april.startYear).toBe(2026)
    expect(december.startYear).toBe(2026)
    expect(april.status).toBe('ok')
    expect(december.status).toBe('ok')
    expect(december.status).toBe(april.status)
    expect(december.certainty).toBe(april.certainty)
  })

  it('L3 esrs_2023 with an implausibly early year reports OK -- no lower bound is applied, and whether one exists is UNVERIFIED', () => {
    // Asserted as-is. The assertion is a statement about THIS CODE, and it is true: no lower bound
    // is applied for esrs_2023, so a year beginning in 226 falls through to 'ok'.
    //
    // ⚠️ WHAT THIS TEST MUST NOT BE READ AS SAYING. An earlier draft of this comment claimed the
    // act "states no lower bound, full stop". That was wrong in a way worth recording, because it
    // was asserted before the instrument was in the repo and it sounded like a finding:
    // C(2026) 5010 DOES NOT ADDRESS THE QUESTION AT ALL. It amends Del. Reg. (EU) 2023/2772 and
    // never states when 2023/2772 itself first applied. Silence in an amending act is not a
    // statement that no bound exists.
    //
    // Whether ESRS (2023) has a first-application date is therefore UNVERIFIED here. The instrument
    // that would settle it -- Del. Reg. (EU) 2023/2772, OJ L, 2023/2772, 22.12.2023 -- is NOT in
    // this repo. docs/reference/README.md records the same gap, alongside Del. Reg. (EU) 2025/1416
    // (OJ L, 2025/1416, 10.11.2025), which both limbs of Article 2(1) are defined relative to.
    //
    // NOT FIXED HERE, and a plausibility floor would not fix it either -- that would be a guess
    // about typos wearing the clothes of a legal rule. If a floor is wanted it should be a
    // separately named concern ("this date looks like a typo"), never folded into the version
    // check, which would make one status mean two things again.
    const r = checkReportingPeriod('0226-01-01', null, 'esrs_2023')
    expect(shapeOf(r)).toEqual({
      standardVersion: 'esrs_2023',
      periodStart: '0226-01-01',
      periodEnd: null,
      startYear: 226,
      status: 'ok',
      certainty: null,
    })
    expect(r.message).toBeNull()
  })
})
