import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  ESRS_TOPIC_COUNT, ESRS_TOPIC_COUNT_WORD, ESRS_TEN_TOPICS_SENTENCE,
} from './csrd'

/**
 * The ESRS topical-standard count, held once.
 *
 * ⚠️ IT WAS 28 OCCURRENCES ACROSS 21 FILES. Swept on 26 Sep 2026, and the sweep is why this exists:
 * seven pages and a PDF generator each spelled the number out, so a revision to ESRS Set 1 would have
 * left the marketing site, the pricing page, the methodology page and the board report each claiming a
 * figure nobody had checked.
 *
 * ⚠️ THIS GUARD CANNOT CATCH THE SPLIT FORM, AND IT DOES NOT PRETEND TO. app/materiality/page.tsx held
 * the count as `{ val: '10', unit: 'ESRS topics' }` — a figure across two adjacent fields, rendering as
 * "10 ESRS topics" while containing no whole-string match. lib/aiAct.test.ts's KNOWN LIMIT note reached
 * the same conclusion about dates: "THE DEFENCE IS DERIVATION, NOT A LONGER PATTERN LIST… a date can be
 * split at any boundary, in any field pair, with any abbreviation." A COUNT IS WORSE THAN A DATE,
 * because `10` is a plausible fontSize, borderRadius, score bound and section number. The 26 Sep sweep
 * found four such false positives in one pass: `borderRadius: 10`, `fontSize: 10`, a `0–10` materiality
 * score and five `ESRS 1 §10.3` citations. Only the word-form check below is a pattern match at all, and
 * it deliberately looks for the WORD rather than the digit.
 */

const ROOT = process.cwd()
const SCAN_DIRS = ['app']

/**
 * Rendered spellings of the count. The WORD, never the digit: a digit search is unusable here for the
 * reason in the header, and every customer-facing use spells it out.
 */
const FORBIDDEN = [
  'ten ESRS topic', 'ten ESRS topical standard', 'ten topical standard', 'ten topics', 'ten-topic',
  'Ten topics', 'Ten ESRS topic',
]

/**
 * Files still holding the count as a literal. ⚠️ THE LIST IS THE TO-DO, ASSERTED RATHER THAN WRITTEN
 * DOWN — the same mechanism as CONVERTED in lib/modulePages.test.ts and PENDING_STEP_6 in
 * lib/tokenContrast.test.ts. Each entry is removed in the commit that converts its file, and a NEW file
 * holding a literal fails immediately.
 *
 * ⚠️ THE DASHBOARD TEN ARE A SEPARATE COMMIT WITH A DIFFERENT RISK PROFILE, which is why they are here
 * rather than converted. app/dashboard/materiality/report/page.tsx generates a VERIFIER-FACING document
 * and carries correction history in its comments (the ESRS 1 §10.3 phase-in, among others); three of the
 * ten are in it. docs/backlog.md names all ten.
 *
 * ⚠️ lib/ IS NOT SCANNED, so lib/materiality/boardReport.ts is listed for the record rather than
 * enforced: it renders into the board report PDF and belongs with the dashboard commit. If SCAN_DIRS ever
 * gains 'lib', that entry starts doing work and the eighteen comment occurrences will need excluding.
 */
const PENDING: string[] = [
  'app/dashboard/climate-risk/page.tsx',
  'app/dashboard/materiality/report/page.tsx',
  // ⚠️ TWO ENTRIES LEFT THIS LIST BECAUSE THE LIST CHECKED ITSELF, and both were my error rather than
  // the tree's. app/dashboard/materiality/worksheet/[id]/determine/page.tsx holds its occurrence in a
  // JSDoc block; app/dashboard/materiality/survey/[id]/results/page.tsx holds its at line 352, which is
  // a CONTINUATION line inside a multi-line JSX comment and was misread as rendered copy by a per-line
  // comment test. Neither needs converting. The both-directions check below reported both as stale on
  // the first run after the stripper was fixed — which is the whole argument for asserting a to-do list
  // rather than writing one down.
  // ⚠️ app/dashboard/materiality/worksheet/[id]/determine/page.tsx WAS LISTED HERE AND SHOULD NOT HAVE
  // BEEN. Its only occurrence is inside a JSDoc block, so it needs no conversion — and the both-
  // directions check below is what proved it, on the first run, by reporting the entry as stale. That
  // is the list keeping itself honest rather than me keeping it honest.
]

/** Files that name the count to FORBID or explain it. */
const EXCLUDED = new Set([
  'lib/csrd.ts', 'lib/csrd.test.ts',
])

/**
 * Which lines of a file are PROSE ABOUT the count rather than a live claim.
 *
 * ⚠️ THIS TRACKS BLOCK-COMMENT STATE RATHER THAN TESTING EACH LINE ON ITS OWN, and that is not
 * gold-plating — the line-at-a-time version (copied from lib/aiAct.test.ts) FAILED ON ITS FIRST RUN.
 * app/materiality/page.tsx:447 is a CONTINUATION line inside a multi-line JSX block comment: it
 * opens with "these ten boxes was the SVG's <title>", so it starts with neither `//` nor `*`, and a
 * per-line test reads it as code. That file is converted, so it reported as a regression when nothing
 * had regressed. Stripping comment SPANS rather than comment LINES is the third time this session that
 * distinction has mattered, and docs/backlog.md carries the shared helper as its own task.
 *
 * Deliberately still NOT skipping a trailing comment after code on the same line: that line contains
 * code, and the bias should stay strict.
 */
function commentLines(src: string): Set<number> {
  const out = new Set<number>()
  let inBlock = false
  src.split('\n').forEach((line, i) => {
    const n = i + 1
    const t = line.trimStart()
    if (inBlock) {
      out.add(n)
      if (line.includes('*/')) inBlock = false
      return
    }
    if (t.startsWith('//')) { out.add(n); return }
    if (t.startsWith('/*') || t.startsWith('{/*')) {
      out.add(n)
      if (!line.includes('*/')) inBlock = true
      return
    }
  })
  return out
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

describe('the ESRS topical-standard count lives in one place', () => {
  it('the number and its word form agree, and the derivation in the comment sums to it', () => {
    // E1–E5 environmental (5) + S1–S4 social (4) + G1 governance (1). The arithmetic is in the
    // constant's comment; this asserts the comment and the value cannot drift apart.
    expect(5 + 4 + 1).toBe(ESRS_TOPIC_COUNT)
    const WORDS: Record<number, string> = {
      8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
    }
    expect(WORDS[ESRS_TOPIC_COUNT],
      `no word form is known for ${ESRS_TOPIC_COUNT}. Add it to WORDS here and update ` +
      'ESRS_TOPIC_COUNT_WORD in lib/csrd.ts in the same edit, or the copy and the number diverge.')
      .toBe(ESRS_TOPIC_COUNT_WORD)
  })

  it('the sentence carries the same count it describes', () => {
    // ⚠️ THE SENTENCE SPELLS THE WORD RATHER THAN INTERPOLATING IT, and that is checked rather than
    // trusted. It is a verified string read by several surfaces, so it is asserted in place instead of
    // being refactored — the same call lib/aiAct.ts makes about AI_ACT_HIGH_RISK_SENTENCE.
    expect(ESRS_TEN_TOPICS_SENTENCE,
      'ESRS_TEN_TOPICS_SENTENCE no longer contains ESRS_TOPIC_COUNT_WORD. One of the two moved without ' +
      'the other, which is exactly the drift this file exists to stop.')
      .toContain(ESRS_TOPIC_COUNT_WORD)
  })

  it('no file under app/ states the count as a literal, outside the pending list', () => {
    const pending = new Set(PENDING)
    const offenders: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        const rel = relative(ROOT, join(ROOT, file)).split('\\').join('/')
        if (EXCLUDED.has(rel) || pending.has(rel)) continue
        const src = readFileSync(file, 'utf8')
        const comments = commentLines(src)
        src.split('\n').forEach((line, i) => {
          if (comments.has(i + 1)) return
          for (const f of FORBIDDEN) {
            if (line.includes(f)) offenders.push(`${rel}:${i + 1}  "${f}"`)
          }
        })
      }
    }
    expect(offenders, offenders.length === 0 ? '' :
      `the ESRS topic count is written out as a literal:\n  ${offenders.join('\n  ')}\n\n` +
      'Import ESRS_TOPIC_COUNT_WORD from lib/csrd and interpolate it. Use the WORD, not the number: ' +
      'every customer-facing sentence spells it out, and substituting the digit is a copy edit ' +
      'disguised as a de-duplication. If the string is single-quoted it must become a template literal ' +
      'first — a ${…} inside single quotes renders literally, which the 26 Sep sweep did twice before ' +
      'catching it.').toEqual([])
  })

  it('every pending file still holds a literal, so the list cannot rot', () => {
    // Both directions, as with CONVERTED: a pending file that no longer needs to be pending is a stale
    // entry, and a stale entry is how an allow-list turns into a blanket.
    const stale: string[] = []
    for (const rel of PENDING) {
      let src: string
      try { src = readFileSync(join(ROOT, rel), 'utf8') } catch { stale.push(`${rel} does not exist`); continue }
      const comments = commentLines(src)
      const live = src.split('\n').some((l, i) => !comments.has(i + 1) && FORBIDDEN.some(f => l.includes(f)))
      if (!live) stale.push(`${rel} no longer holds a literal — remove it from PENDING`)
    }
    expect(stale, stale.length === 0 ? '' : `${stale.join('\n  ')}`).toEqual([])
  })
})
