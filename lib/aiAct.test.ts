import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// A DATE THAT LIVES IN ONE PLACE CANNOT GO STALE IN SEVEN.
//
// The EU AI Act high-risk dates were seven independent literals in four spellings across four files,
// plus two hand-copied countdown blocks. Regulation (EU) 2026/1744 moved them six days before the
// deadline and NOTHING in the repo changed: the public page kept counting down to a date that had
// already moved, and clamped to "0 days" rather than reading as broken. lib/aiAct.ts is now the single
// source, and this test is what stops the seven coming back — a reviewer cannot see a re-hardcoded
// date in a diff full of copy edits, but this can.
//
// It reads the FILES FROM DISK rather than importing anything, because the defect is textual: a
// literal in a template string type-checks perfectly and passes every other test in this repo.

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'lib']

// Every spelling that has appeared, plus the two CURRENT dates — the point is that even a correct
// date must not be written twice.
const FORBIDDEN = [
  'August 2, 2026', 'Aug 2, 2026', 'August 2 2026', '2026-08-02',
  'August 2, 2027', 'Aug 2, 2027', 'August 2 2027', '2027-08-02',
  '2 December 2027', '2 August 2028', '2027-12-02', '2028-08-02',
]

const EXCLUDED_FILES = new Set([
  'lib/aiAct.ts',        // the single source — this is where the dates are SUPPOSED to be
  'lib/aiAct.test.ts',   // this file names them to forbid them
  // DELIBERATE EXCEPTION. app/methodology/page.tsx carries a verifier-facing prose statement of the
  // amendment: OJ publication and in-force dates, the article replaced, both new dates, the two
  // superseded dates, and the obligations that did NOT move. It names dates the constants do not
  // carry (2 December 2026, 2 February 2025, 2 August 2025), so composing it from them would be
  // partial and would read worse. THE DATES IN THAT FILE MUST BE CHECKED BY HAND when the AI Act
  // timetable next changes — nothing here will catch them.
  'app/methodology/page.tsx',
])

// Line-based, deliberately crude: a line whose first non-space characters open a comment is prose
// ABOUT the change, not a live date. Two such lines exist today and are expected to be skipped —
// app/ai-governance/page.tsx and app/dashboard/ai-governance/page.tsx each explain the countdown
// they replaced by naming `2026-08-02`. Skipping comment LINES keeps the pattern strict rather than
// weakening it to accommodate them. It does NOT skip a trailing comment after code on the same line,
// which is the correct bias: that line still contains code.
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

describe('AI Act dates live in exactly one place', () => {
  it('a date that lives in one place cannot go stale in seven', () => {
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
      `Hardcoded EU AI Act high-risk date(s):\n\n${offences.join('\n')}\n\n` +
      `TO FIX: import from lib/aiAct.ts — AI_ACT_HIGH_RISK_STANDALONE, AI_ACT_HIGH_RISK_EMBEDDED,\n` +
      `AI_ACT_CITATION, or AI_ACT_HIGH_RISK_SENTENCE for a whole sentence. Do not retype the date,\n` +
      `even the CURRENT one: the previous dates were correct when written too, and that is exactly\n` +
      `how a deferral enacted six days before the deadline changed nothing on any surface.\n`,
    ).toEqual([])
  })

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    // Without this, a walk that silently returned nothing would make the test above green forever.
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
