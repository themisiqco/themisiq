import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// A DATE THAT LIVES IN ONE PLACE CANNOT GO STALE — AND CANNOT BE ASSERTED AS SETTLED WHEN IT ISN'T.
//
// The SB 253 first-report date was eight prose literals in five spellings plus FIVE independent
// countdown blocks with THREE different hardcoded seeds (81, 81, 83). One countdown rendered in the
// site-wide nav, above CBAM and AI Governance content. All five clamped at zero or flipped branch, so
// the day after the date they would have read "0 days away" rather than reading as wrong. It also
// reached the GHG engine's FRAMEWORKS table, rendered to a customer beside computed totals under the
// label "Deadline", and the ghg-bot system prompt — twice.
//
// This is the third instance of the same defect class in one day (see lib/aiAct.test.ts,
// lib/cs3d.test.ts), and the most exposed: unlike the other two the date is NOT LAW. CARB has moved
// it twice and the current figure awaits OAL approval, so a surface that prints it without the posture
// states as settled something that has already changed twice.
//
// Reads FILES FROM DISK rather than importing anything: the defect is textual, and a date in a
// template string type-checks perfectly and passes every other test in this repo.

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'lib']

// EVERY PATTERN THAT COULD BELONG TO ANOTHER REGIME IS SB 253-QUALIFIED. This is the crying-wolf
// lesson from lib/cs3d.test.ts, which briefly carried a bare `unit: '2027'` and flagged the AI Act
// stand-alone limb and the first CBAM importer declaration. A guard that fires on innocent lines gets
// deleted, and then the real regression walks in.
//   - The full dates ('November 10, 2026', 'Nov 10, 2026', '2026-11-10') are specific enough to stand
//     alone: nothing else in this repo falls on 10 November.
//   - The AMBIGUOUS forms ('Nov 10', 'November 10') are qualified, because a bare day-and-month with
//     no year is exactly what a future unrelated deadline might use — and is also how this date
//     evaded a whole-string guard once already, split across `val: 'Nov 10'` / `unit: '2026'`.
//
// ⚠️ THE GUARD FORBADE THE OLD SPELLINGS AND NOT THE HOUSE ONE. Every pattern above is MONTH-FIRST —
// 'November 10, 2026' — because that is how the eight original literals were written. But the
// constants read DAY-FIRST: SB253_FIRST_REPORT_DATE is '10 November 2026' and SB253_SHORT carries
// '10 Nov 2026'. None of the month-first patterns is a substring of either. So a developer copying
// the house style onto a new surface — the most likely way this recurs, because it is what the file
// they are reading looks like — walked straight through the guard.
//   The day-first forms are added below. They are as specific as their month-first siblings: nothing
// else in this repo falls on 10 November, so they need no SB 253 qualifier. The bare '10 Nov' and
// '10 November' are NOT added unqualified, for the crying-wolf reason above — a day-and-month with no
// year could belong to a future unrelated deadline — so they are qualified the same way.
const FORBIDDEN = [
  // Full and unambiguous — MONTH-FIRST (the retired spellings).
  'November 10, 2026', 'Nov 10, 2026', '2026-11-10', '2026-11-10T00:00:00',
  // Full and unambiguous — DAY-FIRST (the house style, and the way this will recur).
  '10 November 2026', '10 Nov 2026',
  // Ambiguous alone — qualified.
  "val: 'Nov 10'", "'SB 253 · Nov 10'", 'SB 253 · Nov 10', 'the November 10 deadline',
  'miss the November 10', 'November 10 is',
  "val: '10 Nov'", "'SB 253 · 10 Nov'", 'SB 253 · 10 Nov', 'the 10 November deadline',
  'miss the 10 November', '10 November is',
]

const EXCLUDED_FILES = new Set([
  'lib/sb253.ts',        // the single source — this is where the date is SUPPOSED to be
  'lib/sb253.test.ts',   // this file names it to forbid it
])

// BLOCK-AWARE, backported from lib/sb261.test.ts and lib/ifrsS2.test.ts. It was line-based — a line
// whose first non-space characters open a comment is prose ABOUT the change, not a live date — and
// that is right for `//` but WRONG FOR A BLOCK: only the FIRST line of a `/* … */` or `{/* … */}`
// carries a marker, so every continuation line read as CODE. This repo's rationale comments are
// exactly that shape, ten and fifteen lines long, and several quote the retired spellings as the
// wording they replaced. A comment recording which literals were removed would trip the guard that
// removed them.
//
// ⚠️ PURELY PREVENTIVE TODAY, and that is worth stating rather than implying. 507 lines across app/
// and lib/ change classification under this function — but ZERO of them carry an SB 253 forbidden
// pattern, so the guard's verdict is identical before and after. It was not producing a false pass
// or a false fail; it was one long comment away from doing so.
//
// Bias preserved: a comment OPENED AFTER CODE on the same line does not make the line prose — the
// line still contains code, and that is the correct direction to err in.
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

// Exported shape so the prove-it-bites test below runs the SAME matcher over planted lines. A guard
// whose patterns are never demonstrated to fire is a guard nobody has checked — this file had no
// such test until the two siblings were written with one.
export const scanLines = (src: string): string[] => {
  const comments = commentLineNumbers(src)
  const hits: string[] = []
  src.split('\n').forEach((line, i) => {
    if (comments.has(i + 1)) return
    for (const p of FORBIDDEN) if (line.includes(p)) hits.push(`${i + 1}:${p}`)
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

describe('SB 253 dates live in exactly one place', () => {
  it('a date that is not yet law cannot be asserted as settled in eight places', () => {
    const offences: string[] = []

    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split('\\').join('/')
        if (EXCLUDED_FILES.has(rel)) continue
        for (const hit of scanLines(readFileSync(file, 'utf8'))) {
          const cut = hit.indexOf(':')
          offences.push(`${rel}:${hit.slice(0, cut)} — "${hit.slice(cut + 1)}"`)
        }
      }
    }

    expect(offences, offences.length === 0 ? '' :
      `Hardcoded SB 253 date(s):\n\n${offences.join('\n')}\n\n` +
      `TO FIX: import from lib/sb253.ts — SB253_FIRST_REPORT_DATE, SB253_DATE_STATUS,\n` +
      `SB253_STATUS_SENTENCE, SB253_SHORT, SB253_FRAMEWORK_DEADLINE, SB253_SCOPE3_FROM.\n` +
      `AND CARRY THE POSTURE: this date is a CARB proposal awaiting OAL approval, not law. It has\n` +
      `moved twice. A surface that prints it without "proposed" asserts as settled something that\n` +
      `has already changed twice — which is worse than a stale date, because it reads as authority.\n`,
    ).toEqual([])
  })

  // ── PROOF THAT EACH PATTERN BITES ────────────────────────────────────────────────────────────────
  //
  // This file went green for months without one. A green scan is equally consistent with a guard that
  // matches nothing — and this guard WAS one, for the spelling that mattered: every pattern was
  // month-first while the constants are day-first, so a developer copying the house style walked
  // through it. The day-first patterns were added afterwards; these assertions are what would have
  // caught the gap at the time.
  it('every forbidden pattern is caught when planted in code', () => {
    const plants: [string, string][] = [
      ['month-first full',  "  const d = 'November 10, 2026'"],
      ['month-first short', "  const d = 'Nov 10, 2026'"],
      ['ISO',               "  const d = '2026-11-10'"],
      ['DAY-FIRST full',    "  const d = '10 November 2026'"],
      ['DAY-FIRST short',   "  const d = '10 Nov 2026'"],
      ['split val',         "  { val: 'Nov 10', unit: '2026' }"],
      ['split val, day',    "  { val: '10 Nov', unit: '2026' }"],
      ['prose month-first', "  <p>the November 10 deadline</p>"],
      ['prose day-first',   "  <p>the 10 November deadline</p>"],
    ]
    for (const [label, line] of plants) {
      expect(scanLines(line), `${label} planted in code was NOT caught`).not.toEqual([])
    }
  })

  it('THE HOUSE STYLE is caught — the gap this guard shipped with', () => {
    // The constants read '10 November 2026' and '10 Nov 2026'. Every original pattern was month-first,
    // and none is a substring of either, so the most likely way to reintroduce the date — copying the
    // file you are reading — passed silently. Pinned separately because it is the specific failure.
    expect(scanLines("  const d = '10 November 2026'")).not.toEqual([])
    expect(scanLines("  const d = '10 Nov 2026'")).not.toEqual([])
  })

  it('block comments are skipped in full, not just their first line', () => {
    // The reason for the backport. Only the first line of a JSX block carries a marker; under the old
    // line-based check the two continuation lines here would have been read as code and flagged.
    const jsxBlock = [
      '          {/* The date lived as eight prose literals in five spellings —',
      "              'November 10, 2026', 'Nov 10, 2026', and later '10 November 2026' —",
      '              each asserting it as a settled deadline. */}',
    ].join('\n')
    expect(scanLines(jsxBlock), 'a continuation line of a JSX comment was read as code').toEqual([])
    // And the same text outside a comment must still be caught, or the skip is too broad.
    expect(scanLines("  const d = '10 November 2026'")).not.toEqual([])
  })

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    // Without this, a walk that silently returned nothing would make the test above green forever.
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
