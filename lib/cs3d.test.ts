import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// A DATE THAT LIVES IN ONE PLACE CANNOT GO STALE IN EIGHT.
//
// CS3D's application date said 2027 in eight places across four spellings — '· 2027',
// 'applies from 2027', '2027 (large companies)', "unit: '2027'" — spanning the supply-chain module,
// its marketing page and the PRICING page. Meanwhile lib/deals/assessment.ts already carried the
// correct 26 July 2029 WITH its citation. The repo disagreed with itself by two years about a
// directive that introduces civil liability, and the right answer was already in the tree.
//
// This is the aiAct.test.ts guard applied to the second instance of the same defect. It reads FILES
// FROM DISK rather than importing anything, because the defect is textual: a date in a template
// string type-checks perfectly and passes every other test in this repo.

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'lib']

// The stale spellings AND the current dates. Forbidding the correct date matters as much as
// forbidding the wrong one: 2027 was correct when it was written, which is precisely how it survived
// in eight places.
// EVERY PATTERN MUST BE CS3D-QUALIFIED. A bare year belongs to whichever regime the surrounding copy
// is about, and this repo dates at least four others in 2027 — SB 253 Scope 3, the AI Act stand-alone
// limb, the first CBAM importer declaration, CBAM's default mark-up step. An unqualified `unit: '2027'`
// was in this list for one run and caught two of them; a guard that cries wolf gets deleted, and then
// the real regression walks in. Narrowness is the feature.
const FORBIDDEN = [
  // Stale — the four spellings that actually existed.
  'CS3D · 2027', 'CS3D applies from 2027', '2027 (large companies)',
  'due diligence · 2027',
  // Current — must be imported, never retyped.
  '26 July 2029', '26 July 2028', '2029-07-26', '2028-07-26',
]

const EXCLUDED_FILES = new Set([
  'lib/cs3d.ts',        // the single source — this is where the dates are SUPPOSED to be
  'lib/cs3d.test.ts',   // this file names them to forbid them
])

// Line-based, matching lib/aiAct.test.ts: a line whose first non-space characters open a comment is
// prose ABOUT the change, not a live date. Does NOT skip a trailing comment after code on the same
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

describe('CS3D dates live in exactly one place', () => {
  it('a date that lives in one place cannot go stale in eight', () => {
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
      `Hardcoded CS3D date(s):\n\n${offences.join('\n')}\n\n` +
      `TO FIX: import from lib/cs3d.ts — CS3D_APPLIES_FROM, CS3D_TRANSPOSITION, CS3D_CITATION,\n` +
      `CS3D_EMPLOYEE_THRESHOLD, CS3D_TURNOVER_THRESHOLD. Do not retype the date, even the CURRENT\n` +
      `one: 2027 was correct when it was written, and that is exactly how it came to sit in eight\n` +
      `places in four spellings while the corrected date sat in a ninth.\n`,
    ).toEqual([])
  })

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    // Without this, a walk that silently returned nothing would make the test above green forever.
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
