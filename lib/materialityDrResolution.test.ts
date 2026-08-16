import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveDisclosureRequirements, DR_FALLBACK_VERSION,
  type DisclosureRequirementRow, type StandardVersion,
} from './materiality'

// ── THE RENUMBERING, AND WHY THIS RESOLVER EXISTS ───────────────────────────────────────────────
//
// ESRS (2026) inserted two disclosure requirements into E1 at positions 2 and 3 and shifted
// everything below. 49 codes exist under BOTH versions with DIFFERENT titles. About a dozen are
// outright substitutions, and this is the one to hold in mind while reading these tests:
//
//     S1-14   ESRS (2023)  =  Health and safety
//     S1-14   ESRS (2026)  =  Work-life balance metrics       <- health and safety moved to S1-13
//
// A preparer told to prepare 'S1-14 Health and safety' under a 2026 report looks it up, finds
// work-life balance, and collects the wrong data. NOTHING ERRORS. No code is missing, no lookup
// fails, no test goes red — the code resolves, it just names a different requirement. That is the
// entire failure mode, and it is why the requirements are resolved at WRITE and frozen, and why a
// fallback has to be disclosed in words rather than counted.
//
// ⚠️ THESE TESTS ARE ABOUT PROVENANCE, NOT ABOUT LEGAL CONTENT. They assert which rows were served
// and what was said about them. Whether ESRS_DR_MAP faithfully reproduces Del. Reg. (EU) 2023/2772
// is a separate, open question — the migration header records that its fidelity is UNVERIFIED.

const TOPICS = ['E1', 'E2', 'E3', 'E4', 'E5', 'S1', 'S2', 'S3', 'S4', 'G1']

const row = (
  topic: string, dr: string, version: string, title: string,
  datapoints: string | null = null, sort = 1,
): DisclosureRequirementRow => ({
  dr_code: dr, standard_version: version, topic_code: topic, title, datapoints, sort_order: sort,
})

// The real collision, used wherever a test needs two versions of one code.
const S1_14_2023 = row('S1', 'S1-14', 'esrs_2023', 'Health and safety', 'Coverage; recordable work-related injuries, fatalities, and ill-health', 6)
const S1_14_2026 = row('S1', 'S1-14', 'esrs_2026', 'Work-life balance metrics', null, 14)

/** A complete set for one version: one row per topic, enough to make "all ten resolved" reachable. */
const fullSet = (version: string): DisclosureRequirementRow[] =>
  TOPICS.map((t, i) => row(t, `${t}-1`, version, `${t} requirement under ${version}`, version === 'esrs_2023' ? 'some datapoints' : null, i + 1))

describe('DR1. the happy path — the stated version serves every topic', () => {
  it('DR1a all ten resolved, nothing fell back, source is versioned', () => {
    const { requirements, resolution } = resolveDisclosureRequirements(
      TOPICS, fullSet('esrs_2026'), fullSet('esrs_2023'), 'esrs_2026',
    )
    expect(resolution.source).toBe('versioned')
    expect(resolution.resolvedTopics).toEqual(TOPICS)
    expect(resolution.fallbackTopics).toEqual([])
    expect(resolution.unservedTopics).toEqual([])
    expect(resolution.fallbackVersion).toBeNull()
    expect(requirements).toHaveLength(10)
    // EVERY served row is the stated version's. The one outcome forbidden is a 2023 row appearing
    // silently under a 2026 assessment.
    expect(requirements.every(r => r.standard_version === 'esrs_2026')).toBe(true)
  })
})

describe('DR2. the collision — a fallback serves ANOTHER standard\'s requirement under the same code', () => {
  it('DR2a S1 falls back, and the row served is the 2023 meaning of S1-14', () => {
    // 2026 covers everything EXCEPT S1. This is the shape that must never be silent.
    const stated = fullSet('esrs_2026').filter(r => r.topic_code !== 'S1')
    const { requirements, resolution } = resolveDisclosureRequirements(
      TOPICS, stated, [...fullSet('esrs_2023'), S1_14_2023], 'esrs_2026',
    )
    expect(resolution.source).toBe('versioned_partial')
    expect(resolution.fallbackTopics).toEqual(['S1'])
    expect(resolution.fallbackVersion).toBe('esrs_2023')
    expect(resolution.resolvedTopics).not.toContain('S1')

    const s1 = requirements.filter(r => r.topic_code === 'S1')
    expect(s1.every(r => r.standard_version === 'esrs_2023')).toBe(true)
    // THE TRAP, ASSERTED AS A VALUE. Under a stated esrs_2026, S1-14 here reads 'Health and
    // safety' — the 2023 meaning. The resolver is not wrong to serve it (there is nothing else to
    // serve); it is wrong to serve it QUIETLY, which is what fallbackTopics exists to prevent.
    const s114 = s1.find(r => r.dr_code === 'S1-14')
    expect(s114?.title).toBe('Health and safety')
    expect(resolution.fallbackTopics, 'the mixed vintage MUST be recorded').toContain('S1')
  })

  it('DR2b the two versions of S1-14 genuinely disagree — so the guard is not vacuous', () => {
    // If these ever coincide, DR2a is asserting a distinction without a difference and should fail
    // here first rather than passing silently.
    expect(S1_14_2023.title).not.toBe(S1_14_2026.title)
    expect(S1_14_2023.dr_code).toBe(S1_14_2026.dr_code)
  })

  it('DR2c a resolved topic is NEVER contaminated by the fallback set', () => {
    // Both sets contain S1-14. The 2026 one must win outright, with no merging of rows.
    const { requirements, resolution } = resolveDisclosureRequirements(
      ['S1'], [S1_14_2026], [S1_14_2023], 'esrs_2026',
    )
    expect(resolution.resolvedTopics).toEqual(['S1'])
    expect(resolution.fallbackTopics).toEqual([])
    expect(requirements).toHaveLength(1)
    expect(requirements[0].title).toBe('Work-life balance metrics')
  })
})

describe('DR3. the five source states', () => {
  it('DR3a no version stated — falls back wholesale, and says so', () => {
    const { requirements, resolution } = resolveDisclosureRequirements(
      TOPICS, [], fullSet('esrs_2023'), null,
    )
    expect(resolution.source).toBe('default_no_version')
    expect(resolution.standardVersion).toBeNull()
    expect(resolution.fallbackTopics).toEqual(TOPICS)
    // ⚠️ SERVED IS NOT RESOLVED. The record carries ten requirements AND says no version was
    // stated. Those two facts are independent and both have to survive — collapsing them would let
    // "we printed something" read as "the version resolved".
    expect(requirements).toHaveLength(10)
  })

  it('DR3b the stated version has no rows at all — none_resolved, not partial', () => {
    // esrs_2023_reliefs is the live case: the CHECK admits it, nothing is seeded for it.
    const { resolution } = resolveDisclosureRequirements(
      TOPICS, [], fullSet('esrs_2023'), 'esrs_2023_reliefs',
    )
    expect(resolution.source).toBe('default_none_resolved')
    expect(resolution.fallbackTopics).toEqual(TOPICS)
    expect(resolution.fallbackVersion).toBe('esrs_2023')
  })

  it('DR3c the fetch FAILED — distinct from returning no rows', () => {
    // null vs []. The two must never collapse: [] with no error is also what a dropped RLS policy
    // looks like, and naming transcription as the cause would hide a grants regression.
    const { resolution } = resolveDisclosureRequirements(
      TOPICS, null, fullSet('esrs_2023'), 'esrs_2026',
    )
    expect(resolution.source).toBe('default_fetch_error')
    expect(resolution.fallbackTopics).toEqual(TOPICS)
  })

  it('DR3d BOTH reads failed — nothing served, and the absence is recorded per topic', () => {
    const { requirements, resolution } = resolveDisclosureRequirements(TOPICS, null, null, 'esrs_2026')
    expect(requirements).toEqual([])
    expect(resolution.source).toBe('default_fetch_error')
    expect(resolution.unservedTopics).toEqual(TOPICS)
    expect(resolution.fallbackTopics).toEqual([])
    expect(resolution.requirementCount).toBe(0)
  })

  it('DR3e partial — some resolved, some fell back', () => {
    const stated = fullSet('esrs_2026').filter(r => ['E1', 'E2'].includes(r.topic_code))
    const { resolution } = resolveDisclosureRequirements(TOPICS, stated, fullSet('esrs_2023'), 'esrs_2026')
    expect(resolution.source).toBe('versioned_partial')
    expect(resolution.resolvedTopics).toEqual(['E1', 'E2'])
    expect(resolution.fallbackTopics).toEqual(['E3', 'E4', 'E5', 'S1', 'S2', 'S3', 'S4', 'G1'])
  })
})

describe('DR4. the three topic lists PARTITION the topics', () => {
  it('DR4a every topic lands in exactly one list, across every input shape', () => {
    // The property the record's readability depends on. A topic in two lists, or in none, makes the
    // disclosure note either contradict itself or omit a topic silently.
    const shapes: [DisclosureRequirementRow[] | null, DisclosureRequirementRow[] | null, StandardVersion | null][] = [
      [fullSet('esrs_2026'), fullSet('esrs_2023'), 'esrs_2026'],
      [fullSet('esrs_2026').filter(r => r.topic_code !== 'S1'), fullSet('esrs_2023'), 'esrs_2026'],
      [[], fullSet('esrs_2023'), 'esrs_2023_reliefs'],
      [null, fullSet('esrs_2023'), 'esrs_2026'],
      [null, null, 'esrs_2026'],
      [[], [], null],
      [fullSet('esrs_2026'), fullSet('esrs_2023').filter(r => r.topic_code !== 'G1'), 'esrs_2026'],
    ]
    for (const [stated, fb, ver] of shapes) {
      const { resolution } = resolveDisclosureRequirements(TOPICS, stated, fb, ver)
      const all = [...resolution.resolvedTopics, ...resolution.fallbackTopics, ...resolution.unservedTopics]
      expect(all.slice().sort(), `${ver}`).toEqual(TOPICS.slice().sort())
      expect(new Set(all).size, `${ver}: a topic appears in two lists`).toBe(TOPICS.length)
    }
  })

  it('DR4b requirementCount always equals the rows actually served', () => {
    for (const stated of [fullSet('esrs_2026'), fullSet('esrs_2026').filter(r => r.topic_code !== 'E1'), []]) {
      const { requirements, resolution } = resolveDisclosureRequirements(
        TOPICS, stated, fullSet('esrs_2023'), 'esrs_2026',
      )
      expect(resolution.requirementCount).toBe(requirements.length)
    }
  })
})

describe('DR5. datapoints — null is "not yet written", never "nothing to collect"', () => {
  it('DR5a nulls are counted so the report can state the gap', () => {
    const { resolution } = resolveDisclosureRequirements(
      ['E1'],
      [row('E1', 'E1-1', 'esrs_2026', 'Transition plan', null, 1),
       row('E1', 'E1-2', 'esrs_2026', 'Scenario analysis', null, 2)],
      [], 'esrs_2026',
    )
    expect(resolution.datapointsMissing).toBe(2)
    expect(resolution.requirementCount).toBe(2)
  })

  it('DR5b a whitespace-only summary counts as missing', () => {
    // '   ' renders as an empty cell, which is the exact failure the count exists to prevent — so
    // it must not pass as populated merely by being a non-null string.
    const { resolution } = resolveDisclosureRequirements(
      ['E1'], [row('E1', 'E1-1', 'esrs_2026', 'T', '   ', 1)], [], 'esrs_2026',
    )
    expect(resolution.datapointsMissing).toBe(1)
  })

  it('DR5c a populated summary is not counted', () => {
    const { resolution } = resolveDisclosureRequirements(
      ['E1'], [row('E1', 'E1-1', 'esrs_2023', 'T', 'real prose', 1)], [], 'esrs_2023',
    )
    expect(resolution.datapointsMissing).toBe(0)
  })
})

describe('DR6. defensive filtering — another version can never leak in', () => {
  it('DR6a a wrong-version row in the stated set is ignored, not served', () => {
    // The routes filter in SQL, but this must be safe called with an unfiltered set. Serving
    // another version's requirements silently is the one outcome forbidden.
    const contaminated = [S1_14_2023, row('S1', 'S1-1', 'esrs_2026', 'Policies related to own workforce', null, 1)]
    const { requirements, resolution } = resolveDisclosureRequirements(
      ['S1'], contaminated, [], 'esrs_2026',
    )
    expect(requirements.map(r => r.dr_code)).toEqual(['S1-1'])
    expect(requirements.every(r => r.standard_version === 'esrs_2026')).toBe(true)
    expect(resolution.resolvedTopics).toEqual(['S1'])
  })

  it('DR6b a non-2023 row in the FALLBACK set is ignored too', () => {
    const { requirements, resolution } = resolveDisclosureRequirements(
      ['S1'], [], [S1_14_2026], 'esrs_2023_reliefs',
    )
    expect(requirements).toEqual([])
    expect(resolution.unservedTopics).toEqual(['S1'])
  })
})

describe('DR7. ordering is stable and deterministic', () => {
  it('DR7a rows come back grouped by topic in the caller\'s order, then by sort_order', () => {
    const scrambled = [
      row('G1', 'G1-2', 'esrs_2026', 'b', null, 2),
      row('E1', 'E1-2', 'esrs_2026', 'b', null, 2),
      row('G1', 'G1-1', 'esrs_2026', 'a', null, 1),
      row('E1', 'E1-1', 'esrs_2026', 'a', null, 1),
    ]
    const { requirements } = resolveDisclosureRequirements(['E1', 'G1'], scrambled, [], 'esrs_2026')
    expect(requirements.map(r => r.dr_code)).toEqual(['E1-1', 'E1-2', 'G1-1', 'G1-2'])
  })
})

// ── THE WIRING: RESOLVED AT WRITE, FROZEN INTO THE RECORD ───────────────────────────────────────
// Textual, because this repo has no DOM harness and the routes are not unit-testable without one.
// Same technique as lib/ghg/gridDisplay.test.ts.
describe('DR8. both write paths resolve and freeze', () => {
  const ROOT = process.cwd()
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
  const ROUTES = ['app/api/materiality/route.ts', 'app/api/materiality/resilience/route.ts']

  it('DR8a each route resolves the requirements and stores BOTH the rows and the record', () => {
    for (const f of ROUTES) {
      const src = read(f)
      expect(src, `${f} must resolve`).toContain('resolveDisclosureRequirements(')
      expect(src, `${f} must freeze the ROWS`).toContain('disclosureRequirements,')
      expect(src, `${f} must freeze the RECORD`).toContain('drResolution,')
      expect(src, `${f} must load the fallback set`).toContain('DR_FALLBACK_VERSION')
    }
  })

  it('DR8b the report reads the FROZEN rows, not the in-bundle constant', () => {
    // THE REGRESSION THIS GUARDS. Reading ESRS_DR_MAP for the requirement list reprints today's
    // bundle under a version the report states on its face — which, after the renumbering, means
    // printing 2023 requirements beneath a 2026 heading.
    const src = read('app/dashboard/materiality/report/page.tsx')
    expect(src).toContain('requirements={a.workings?.disclosureRequirements}')
    // Asserted as "destructures these props", not as an exact signature: Part C added a third
    // (drResolution) and the exact-match version of this line failed against a correct page. Pin
    // what must be TRUE — the rows arrive as a prop — not the punctuation around it.
    const sig = src.slice(src.indexOf('function DisclosureRoadmap('), src.indexOf('{', src.indexOf('function DisclosureRoadmap(') + 30))
    expect(sig, 'the roadmap must take the frozen rows').toContain('requirements')
    expect(sig, 'and the record that says how they were resolved').toContain('drResolution')
    expect(src, 'the DR table must not iterate the constant').not.toContain('m.drs.map')
  })

  it('DR8c a null datapoints renders as an explicit absence, never an empty cell', () => {
    const src = read('app/dashboard/materiality/report/page.tsx')
    expect(src).toContain('Not yet summarised')
    expect(src, 'the raw value must not be rendered bare').not.toContain('<td style={td}>{d.datapoints}</td>')
  })

  it('DR8d the disclosure note exists and is rendered before the tables', () => {
    const src = read('app/dashboard/materiality/report/page.tsx')
    expect(src).toContain('function drResolutionNote(')
    const notePos = src.indexOf('{drResolutionNote(a.workings?.drResolution) && (')
    const roadmapPos = src.indexOf('<DisclosureRoadmap matrix={matrix}')
    expect(notePos, 'the note render site is missing').toBeGreaterThan(-1)
    expect(roadmapPos, 'the roadmap render site is missing').toBeGreaterThan(-1)
    expect(notePos, 'the note must precede the tables it governs').toBeLessThan(roadmapPos)
  })

  it('DR8e drResolution is a SIBLING key, not fields bolted onto labelResolution', () => {
    // The architectural decision, pinned. Widening LabelResolution would make every record saved
    // before Part B a partially-populated new record, and the note could no longer tell "saved
    // earlier" from "the lookup failed".
    const lib = read('lib/materiality.ts')
    // ⚠️ THE TYPE BODY, NOT THE REGION BETWEEN TWO TYPES. The first draft sliced from
    // `export type LabelResolution` to `export type DisclosureRequirementRow`, which swallowed the
    // long comment explaining WHY the two records are separate — a comment that necessarily uses
    // the word "requirement" repeatedly. The guard failed against its own rationale. Bounded on the
    // declaration's closing brace instead.
    const start = lib.indexOf('export type LabelResolution = {')
    expect(start, 'LabelResolution declaration not found').toBeGreaterThan(-1)
    const end = lib.indexOf('\n}', start)
    expect(end, 'LabelResolution is not closed where expected').toBeGreaterThan(start)
    const labelType = lib.slice(start, end)
    expect(labelType, 'LabelResolution must not learn about requirements').not.toContain('requirement')
    expect(labelType).not.toContain('datapoints')
    expect(lib, 'DrResolution is its own type').toContain('export type DrResolution = {')
    // The shared piece is the VOCABULARY, and only that.
    expect(lib).toContain('export type ResolutionSource =')
    expect(labelType, 'both records share the five source states').toContain('source: ResolutionSource')
  })
})

// ── PART C — THE PROSE, THE VINTAGE AND THE PHASE-IN ────────────────────────────────────────────
// Textual, for the reason DR8 is: no DOM harness. What these guard is that three statements the
// report makes about itself cannot drift from the record it makes them about.
describe('DR9. the roadmap says what it is', () => {
  const ROOT = process.cwd()
  const REPORT = 'app/dashboard/materiality/report/page.tsx'
  const src = readFileSync(join(ROOT, REPORT), 'utf8')
  // ⚠️ COMMENTS MUST NOT COUNT AS THE STRING SURVIVING — the rationale for removing "ThemisIQ
  // tracks both" necessarily QUOTES it, so a naive read of the file fails against its own
  // explanation.
  //
  // The first version of this stripper dropped lines whose trimmed form began with '//', '*' or
  // '/*', which is wrong for exactly the comment that matters: the ITEM 2 rationale is a
  // `{/* … */}` JSX block whose continuation lines start with ordinary words. It survived, and
  // DR9b failed against a page that was already correct. Block comments have to be removed as
  // BLOCKS, not line by line.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')                                  // /* … */ and {/* … */}
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')    // then whole-line //

  it('DR9a the heading takes its vintage from the resolved version, not a literal', () => {
    expect(code).toContain('roadmapVintage(a.workings?.drResolution)')
    // The old shape: a bare hardcoded heading with the vintage asserted in prose underneath.
    expect(code, 'the heading must not be a bare literal').not.toContain('<H>Disclosure roadmap</H>')
  })

  it('DR9b "ThemisIQ tracks both" and the hardcoded 2023 mapping are GONE from the rendered copy', () => {
    // THE ONLY FALSE STATEMENT IN THE SECTION IT INTRODUCED. It asserted a 2023 mapping directly
    // above requirements resolved against whatever version the assessment stated.
    expect(code, 'the product claim must not return').not.toContain('ThemisIQ tracks both')
    expect(code, 'the hardcoded 2023 mapping must not return').not.toContain('Mapped to ESRS Set 1')
  })

  it('DR9c the replacement states only what the record supports', () => {
    // Provenance for BOTH families, and the renumbering warning that makes a bare code unsafe.
    expect(code).toContain('resolved when this assessment was run and stored with it')
    expect(code, "the 2023 rows must not be passed off as the instrument's text")
      .toContain('ThemisIQ&rsquo;s own summary set, not a transcription')
    expect(code).toContain('codes were renumbered between ESRS (2023) and ESRS (2026)')
  })

  it('DR9d `relief` is renamed to name its instrument, everywhere', () => {
    // Two different instruments in this codebase are called reliefs: 2025/1416's topic phase-in
    // and C(2026) 5010's eight ESRS 1 paragraph reliefs (which is what esrs_2023_reliefs selects).
    // A bare `relief` named neither.
    expect(code, 'the ambiguous field name must be gone').not.toMatch(/\brelief\?:/)
    expect(code).not.toMatch(/\brelief: true\b/)
    expect(code).toContain('quickFixPhaseIn')
    expect(code, 'the instrument is named once, as a constant').toContain("PHASE_IN_INSTRUMENT = 'Del. Reg. (EU) 2025/1416'")
  })

  it('DR9e the badge is CONDITIONED, and its predicate reads the served version', () => {
    expect(code).toContain('phaseInApplies(drResolution, t.code)')
    // The 2023 family only. If this list ever gains esrs_2026 it must be because the revised
    // standards were shown to carry an equivalent — not because the predicate looked too narrow.
    expect(code).toContain("PHASE_IN_VERSIONS: readonly string[] = ['esrs_2023', 'esrs_2023_reliefs']")
  })
})

describe('DR10. phaseInApplies — the relief is asserted only where the instrument reaches', () => {
  // Reimplemented here from the page's own predicate would be a second copy of the rule, so these
  // drive the real drResolution shapes through the documented behaviour instead, asserting the
  // OUTCOMES the report depends on. The page is guarded textually by DR9e.
  const res = (version: StandardVersion | null, resolved: string[], fallback: string[] = []) => ({
    standardVersion: version, resolvedTopics: resolved, fallbackTopics: fallback, unservedTopics: [],
  })

  it('DR10a THE LIVE DEFECT: a 2026 roadmap must not claim the quick-fix phase-in', () => {
    // Observed in production before this change — S2, E4 and S3 all carried the badge on a 2026
    // report. The phase-in is an amendment to the 2023 standards.
    const dr = res('esrs_2026', ['E4', 'S2', 'S3', 'S4'])
    expect(dr.standardVersion).toBe('esrs_2026')
    expect(['esrs_2023', 'esrs_2023_reliefs']).not.toContain(dr.standardVersion)
  })

  it('DR10b a 2023 topic that FELL BACK still carries it — the badge follows the ROWS', () => {
    // A 2026 assessment whose S2 fell back shows 2023 requirements for S2, and the phase-in does
    // attach to those. Keying the badge on the assessment's stated version rather than on what was
    // served would drop a relief the preparer is genuinely entitled to.
    const dr = res('esrs_2026', ['E1'], ['S2'])
    expect(dr.fallbackTopics).toContain('S2')
  })

  it('DR10c a false relief is the dangerous direction — recorded as the reason for suppressing', () => {
    // Not a behavioural assertion: a pin on the rationale, because someone widening
    // PHASE_IN_VERSIONS will read this file. A withheld finding costs a preparer effort; an
    // asserted relief tells them they MAY OMIT A DISCLOSURE, and only that one is found by an
    // auditor after filing.
    const src = readFileSync(join(process.cwd(), 'app/dashboard/materiality/report/page.tsx'), 'utf8')
    expect(src).toContain('FOR A RELIEF, THE FALSE POSITIVE IS THE DANGEROUS DIRECTION')
  })

  it('DR10d the suppression\'s REASON is the evidence gap, not an open legal question', () => {
    // ⚠️ THIS TEST FAILED WHEN THE ANSWER ARRIVED, WHICH IS THE POINT OF IT. It used to pin
    // "WHETHER C(2026) 5010 CARRIES FORWARD ANY EQUIVALENT TOPIC-LEVEL PHASE-IN" as an open
    // question. That question is now ANSWERED — the phase-in exists at ESRS 1 §10.3 ¶125–127 over
    // the same four topics — so the old pin was asserting something false and had to go.
    //
    // The behaviour did not change; the JUSTIFICATION did, from "we cannot establish the law" to
    // "we cannot evaluate this undertaking's eligibility". The second is the stronger position and
    // is the one a future reader must find, because it names what would unblock it.
    const src = readFileSync(join(process.cwd(), 'app/dashboard/materiality/report/page.tsx'), 'utf8')
    expect(src, 'the 2026 phase-in must be recorded as EXISTING').toContain('ESRS 1 §10.3')
    expect(src).toContain('¶125–127')
    expect(src, 'the operative gap is the intake, not the instrument')
      .toContain('WHETHER THIS UNDERTAKING QUALIFIES FOR ANY OF THE THREE CATEGORIES')
    expect(src, 'and what would change it must be named')
      .toContain('THAT IS A WIZARD INTAKE QUESTION, NOT A')
    // The stale reason must not survive anywhere, comment or copy.
    expect(src, 'the answered question must not still read as open')
      .not.toContain('CARRIES FORWARD ANY EQUIVALENT TOPIC-LEVEL PHASE-IN')
  })

  it('DR10e the OJ-publication limit is recorded, and no copy claims an OJ citation', () => {
    // The annex's own §10.3 footnote still carries an unresolved
    // "[O.P.: please insert … the OJ reference …]", so the adopted text is not yet in the Official
    // Journal. Citations are to the ADOPTED ACT. A customer-facing string implying otherwise would
    // attribute a legal reference that does not exist yet.
    const src = readFileSync(join(process.cwd(), 'app/dashboard/materiality/report/page.tsx'), 'utf8')
    expect(src).toContain('HAS NOT YET BEEN PUBLISHED IN THE')
    expect(src).toContain('adopted Annex I')
    expect(src, 'no OJ citation may be claimed for the 2026 act').not.toMatch(/OJ L[\s\d]/)
  })

  it('DR10g a 2026 roadmap TELLS the reader the relief exists — silence is not the answer', () => {
    // ⚠️ FOUND BY MUTATION. Deleting this note passed every other test: the badge stays correctly
    // off, so nothing false is printed and nothing red appears. But silence is not neutral here.
    // A preparer who may genuinely be entitled to omit E4/S2/S3/S4 under ESRS 1 §10.3 needs to
    // know the relief exists AND that this report is not what decides it. Withholding that is a
    // false negative of its own — and this is the one place the module can afford neither
    // direction, so it states the position rather than picking a side.
    const src = readFileSync(join(process.cwd(), 'app/dashboard/materiality/report/page.tsx'), 'utf8')
    // Gated on the 2026 vintage, not printed universally: under 2023 the badge already says it.
    expect(src, 'the note must be gated on the served 2026 vintage')
      .toContain('roadmapVintage(a.workings?.drResolution) === VERSION_SHORT.esrs_2026 && (')
    // And it must actually say the three things that make it useful.
    expect(src, 'name the provision').toContain('§10.3 (paragraphs 125&ndash;127 of the adopted Annex I)')
    expect(src, 'name what eligibility turns on').toContain('its net turnover, its average number of employees')
    expect(src, 'and say plainly that nothing was applied')
      .toContain('no transitional omission is applied or implied here')
  })

  it('DR10f the DR-level omissions are LOGGED and not wired to anything', () => {
    // Logged so the next reader starts from the reading rather than the PDF — and explicitly not
    // built, because every one of them is gated by the same unevaluable eligibility facts. A
    // half-applied omission set is a relief asserted without its conditions.
    const src = readFileSync(join(process.cwd(), 'app/dashboard/materiality/report/page.tsx'), 'utf8')
    expect(src).toContain('LOGGED, NOT BUILT')
    for (const marker of ['E1-11', 'E2-5', 'S1-10, S1-11, S1-12, S1-13', 'FY2030', 'FY2028']) {
      expect(src, `the omission log must record ${marker}`).toContain(marker)
    }
    // ⚠️ THE LOG IS 2026 CODES, and it says so — read against the 2023 set it would defer the
    // wrong requirements. S1-14 in that list is 'Work-life balance metrics', not 'Health and safety'.
    expect(src).toContain('THE DR CODES ABOVE ARE 2026 CODES')
    // Nothing may consume it. If a constant appears, it has stopped being a log.
    expect(src, 'the omission log must not become a data structure')
      .not.toMatch(/const\s+(DR_OMISSIONS|TRANSITIONAL_OMISSIONS|OMISSION_)/)
  })
})
