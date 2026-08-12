import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// A POSTURE THAT LIVES IN ONE PLACE CANNOT DRIFT — AND SB 261'S DRIFTED FURTHER THAN SB 253'S DATE.
//
// Before lib/sb261.ts existed, the enforcement posture was FOUR SPELLINGS across three files:
//   'Enforcement paused — no new date set'        (/assess timing)
//   'SB 261 · enforcement paused'                 (pricing tag)
//   'Enforcement paused (appeal pending)'         (climate-risk Status cell)
//   "California's SB 261 appeal are all in motion" (climate-risk disclaimer)
// with the long-form account existing in exactly ONE string literal on ONE page, so three of the four
// surfaces stated a posture no reader could check. A fifth surface — the framework directory card —
// described SB 261 as ordinary biennial reporting with NO POSTURE AT ALL.
//
// ⚠️ THE DESIGN DIFFERENCE FROM lib/sb253.test.ts, AND THE REASON THIS FILE EXISTS SEPARATELY:
// 'enforcement paused' IS MATCHED CASE-INSENSITIVELY. The four historical spellings differed in case
// and in punctuation, so an exact-match list of them would have caught none of the others and would
// certainly miss the fifth. A date has one canonical form and a handful of spellings; a POSTURE
// PHRASE has as many as there are authors. Case-folding is what turns this from a list of the
// mistakes already made into a guard against the next one.
//
// ⚠️ AND THE PERISHABILITY ARGUMENT. SB 261's posture rests on a court order with no merits ruling:
// the Ninth Circuit heard argument on 9 January 2026 and can rule any day, with no rulemaking, no
// comment period and no advance signal. An SB 253 date moves through a 15-day notice and OAL
// approval. So the cost of a scattered SB 261 posture is higher — when it changes, every copy has to
// be found, and a copy nobody knows about is a page still asserting a bar that has lifted.
//
// Reads FILES FROM DISK rather than importing anything: the defect is textual, and a posture phrase
// in a template string type-checks perfectly and passes every other test in this repo.

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'lib']

// Case-sensitive: proper nouns, docket numbers, statute sections and dates have one spelling each.
const FORBIDDEN = [
  // The case and the docket. Currently in lib/sb261.ts and in two comments; nowhere else may carry
  // them, because a surface citing the order should cite the CONSTANT that carries it.
  'Chamber of Commerce v. Sanchez', '25-5327',
  // The three dates the posture turns on.
  '18 November 2025', '9 January 2026',
  // ⚠️ QUALIFIED, and this is a crying-wolf fix rather than an oversight. A bare '1 January 2026'
  // COLLIDES WITH CBAM: lib/deals/assessment.ts and lib/deals/sectorRisks.test.ts both carry
  // "The definitive period began 1 January 2026", which has nothing to do with SB 261. Forbidding the
  // bare date would fire on innocent lines, and a guard that cries wolf gets deleted — the lesson
  // lib/cs3d.test.ts records from its own bare `unit: '2027'`. SB261_STATUS_SENTENCE says "The
  // 1 January 2026 deadline is not in effect"; CBAM says "began". So the word that separates them is
  // the qualifier.
  '1 January 2026 deadline',
  // The statute. Appears exactly once outside this guard.
  '\u00a738533',
]

// Case-INSENSITIVE: the posture phrase, for the reason in the header.
const FORBIDDEN_CI = [
  'enforcement paused',
]

const EXCLUDED_FILES = new Set([
  'lib/sb261.ts',        // the single source — this is where the posture is SUPPOSED to be
  'lib/sb261.test.ts',   // this file names the phrases to forbid them
  // EXPLICIT even though the line-skip already covers it. app/pricing/page.tsx carries a deliberate
  // comment block restating the injunction — the order, the docket, the argument date — as the
  // rationale for its tag. That is prose ABOUT the posture and is skipped as a comment anyway, but
  // listing it here means nobody has to work out why the file passes.
  'app/pricing/page.tsx',
])

// BLOCK-AWARE, unlike lib/sb253.test.ts's line-based check — and it has to be. This repo's rationale
// comments are long JSX blocks (`{/* … */}` over ten or fifteen lines), and only the FIRST line of
// such a block starts with a comment marker. A line-based check reads every continuation line as
// CODE, so a comment explaining which spellings were retired would trip the guard that forbids them.
// That is not hypothetical: app/climate-risk/page.tsx has two such blocks quoting the old wording.
//
// Bias preserved from the sibling guard: a comment OPENED AFTER CODE on the same line does not make
// the line prose — the line still contains code, and that is the correct direction to err in.
const commentLineNumbers = (src: string): Set<number> => {
  const out = new Set<number>()
  let inBlock = false
  src.split('\n').forEach((line, i) => {
    const n = i + 1
    const t = line.trimStart()
    if (inBlock) { out.add(n); if (line.includes('*/')) inBlock = false; return }
    if (t.startsWith('//') || t.startsWith('*')) { out.add(n); return }
    if (t.startsWith('/*') || t.startsWith('{/*')) { out.add(n); if (!line.includes('*/')) inBlock = true }
  })
  return out
}

// Exported shape so the proof test below can run the same matcher over planted lines. A guard whose
// patterns are never demonstrated to fire is a guard nobody has checked.
export const scanLines = (src: string): string[] => {
  const comments = commentLineNumbers(src)
  const hits: string[] = []
  src.split('\n').forEach((line, i) => {
    if (comments.has(i + 1)) return
    for (const p of FORBIDDEN) if (line.includes(p)) hits.push(`${i + 1}:${p}`)
    for (const p of FORBIDDEN_CI) if (line.toLowerCase().includes(p.toLowerCase())) hits.push(`${i + 1}:${p}`)
  })
  return hits
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('SB 261 posture lives in exactly one place', () => {
  it('a posture that can change without warning cannot be stated in five spellings', () => {
    const offences: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split('\\').join('/')
        if (EXCLUDED_FILES.has(rel)) continue
        for (const hit of scanLines(readFileSync(file, 'utf8'))) {
          const [ln, pat] = [hit.slice(0, hit.indexOf(':')), hit.slice(hit.indexOf(':') + 1)]
          offences.push(`${rel}:${ln} — "${pat}"`)
        }
      }
    }

    expect(offences, offences.length === 0 ? '' :
      `Hardcoded SB 261 posture / citation:\n\n${offences.join('\n')}\n\n` +
      `TO FIX: import from lib/sb261.ts — SB261_CITATION, SB261_CASE, SB261_STATUS_SENTENCE,\n` +
      `SB261_SHORT, SB261_TABLE_STATUS, SB261_DOCKET_URL.\n` +
      `THE POSTURE RESTS ON A COURT ORDER WITH NO MERITS RULING. The Ninth Circuit can rule any day,\n` +
      `with no rulemaking and no advance signal, so every copy of the wording is a place that will\n` +
      `have to be found and corrected under time pressure — and a copy nobody knows about is a page\n` +
      `still telling a customer that enforcement is barred after it has resumed.\n`,
    ).toEqual([])
  })

  // ── PROOF THAT EACH PATTERN BITES ────────────────────────────────────────────────────────────────
  //
  // A green scan proves nothing on its own: it is equally consistent with a guard that matches
  // nothing at all. These plant a violation per pattern and assert the matcher catches it.
  it('every forbidden pattern is caught when planted in code', () => {
    const plants: [string, string][] = [
      ['case',      "  const c = 'Chamber of Commerce v. Sanchez'"],
      ['docket',    "  const d = 'No. 25-5327'"],
      ['order date', "  const o = 'the order of 18 November 2025'"],
      ['argument',  "  const a = 'argued 9 January 2026'"],
      ['deadline',  "  const x = 'the 1 January 2026 deadline is not in effect'"],
      ['statute',   "  const s = 'Health & Safety Code \u00a738533'"],
    ]
    for (const [label, line] of plants) {
      expect(scanLines(line), `${label} planted in code was NOT caught`).not.toEqual([])
    }
  })

  it('the posture phrase is caught in EVERY casing — the reason this guard exists', () => {
    // The four historical spellings differed in case and punctuation. Each must be caught.
    const casings = [
      "  timing: 'Enforcement paused — no new date set'",
      "  label: 'SB 261 · enforcement paused'",
      "  status: 'Enforcement Paused (appeal pending)'",
      "  x: 'ENFORCEMENT PAUSED'",
      "  y: 'enforcement PAUSED pending appeal'",
    ]
    for (const line of casings) {
      expect(scanLines(line), `not caught: ${line.trim()}`).not.toEqual([])
    }
  })

  it('does NOT fire on the CBAM definitive-period date — the crying-wolf check', () => {
    // The exact wording lib/deals/assessment.ts carries. A bare '1 January 2026' pattern would flag
    // it, the guard would be deleted as noisy, and the real regression would walk in afterwards.
    const cbam = "  consequence: 'The definitive period began 1 January 2026, with a 50-tonne exemption'"
    expect(scanLines(cbam)).toEqual([])
  })

  it('block comments are skipped in full, not just their first line', () => {
    const jsxBlock = [
      '          {/* THE STATUS COLUMN STATES A POSITION, NEVER A TREND. It read',
      "              'Enforcement paused — appeal pending, no new date', which is the constant's",
      '              own text quoted as prose. */}',
    ].join('\n')
    expect(scanLines(jsxBlock), 'a continuation line of a JSX comment was read as code').toEqual([])
    // And the same content OUTSIDE a comment must still be caught, or the skip is too broad.
    expect(scanLines("  const s = 'Enforcement paused — appeal pending, no new date'")).not.toEqual([])
  })

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
