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
    expect(src, 'the roadmap must take the frozen rows').toMatch(/function DisclosureRoadmap\(\{ matrix, requirements \}/)
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
