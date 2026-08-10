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
const FORBIDDEN = [
  // Full and unambiguous.
  'November 10, 2026', 'Nov 10, 2026', '2026-11-10', '2026-11-10T00:00:00',
  // Ambiguous alone — qualified.
  "val: 'Nov 10'", "'SB 253 · Nov 10'", 'SB 253 · Nov 10', 'the November 10 deadline',
  'miss the November 10', 'November 10 is',
]

const EXCLUDED_FILES = new Set([
  'lib/sb253.ts',        // the single source — this is where the date is SUPPOSED to be
  'lib/sb253.test.ts',   // this file names it to forbid it
])

// Line-based, matching the two sibling guards: a line whose first non-space characters open a comment
// is prose ABOUT the change, not a live date. Does NOT skip a trailing comment after code on the same
// line — that line still contains code, which is the correct bias.
const isCommentLine = (line: string): boolean => {
  const t = line.trimStart()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')
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
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, i) => {
          if (isCommentLine(line)) return
          for (const pattern of FORBIDDEN) {
            if (line.includes(pattern)) offences.push(`${rel}:${i + 1} — "${pattern}"`)
          }
        })
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

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    // Without this, a walk that silently returned nothing would make the test above green forever.
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
