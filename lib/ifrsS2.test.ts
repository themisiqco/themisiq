import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { IFRS_S2_ADOPTION_COUNT, IFRS_S2_SHORT } from './ifrsS2'

// A COUNT THAT LIVES IN ONE PLACE CANNOT CONTRADICT ITSELF — AND THIS ONE DID, ACROSS FOUR SURFACES.
//
// The IFRS S2 adoption count existed in TWO DIFFERENT VALUES with no shared constant:
//   '30+ jurisdictions'  on /assess, /climate-ghg and /deals
//   '36+ jurisdictions'  on /climate-risk
// plus 'jurisdictions globally' as a third phrasing on /assess and 'dozens of jurisdictions' as a
// fourth in the climate-risk lede. A customer reading two ThemisIQ pages in one session met two
// numbers for one claim, and nothing in the repo could notice.
//
// ⚠️ THE POINT IS NOT THAT ONE NUMBER WAS WRONG. Both were right, and they answered DIFFERENT
// QUESTIONS: 28 jurisdictions had adopted on a voluntary or mandatory basis as of April 2026, with a
// further 12 planning to, while the IFRS Foundation separately counts 36 that have adopted, otherwise
// used, or are in the process of adopting. Neither page stated which question it was answering. THAT
// is why a bare figure is forbidden here rather than merely standardised: whichever number won, a
// surface printing it alone would still be answering a question it had not asked.
//
// So the bare digits are forbidden too — '28 jurisdictions' and '36 jurisdictions' unqualified —
// and IFRS_S2_ADOPTION_COUNT is the only way to print a figure, because it carries its own qualifier
// and its own as-of date. If a slot cannot fit that string, IFRS_S2_SHORT names no number at all.
//
// Reads FILES FROM DISK: the defect is textual. A count in a template string type-checks perfectly.

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'lib']

const FORBIDDEN = [
  // The two historical values, in the '+' form every surface used.
  '30+ jurisdiction', '36+ jurisdiction',
  // The two other phrasings the same claim wore.
  'jurisdictions globally', 'dozens of jurisdiction',
  // THE BARE FIGURES. Forbidden even though 28 is the correct one, because a number without its
  // question and its date is the defect — see the header. The only legal way to print a figure is
  // IFRS_S2_ADOPTION_COUNT, which carries both.
  '28 jurisdictions', '36 jurisdictions',
]

const EXCLUDED_FILES = new Set([
  'lib/ifrsS2.ts',        // the single source — this is where the count is SUPPOSED to be
  'lib/ifrsS2.test.ts',   // this file names the figures to forbid them
])

// Block-aware, matching lib/sb261.test.ts and deliberately unlike lib/sb253.test.ts's line-based
// check. This repo's rationale comments are long JSX blocks, and only the first line of one starts
// with a marker — a line-based check reads every continuation line as code, so the comment recording
// which spellings were retired would trip the guard forbidding them. app/climate-risk/page.tsx has
// exactly that: a block quoting 'dozens of jurisdictions' as the wording it replaced.
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

describe('IFRS S2 adoption counts live in exactly one place', () => {
  it('two answers to two unstated questions cannot be printed as one figure', () => {
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
      `Hardcoded IFRS S2 adoption count:\n\n${offences.join('\n')}\n\n` +
      `TO FIX: import from lib/ifrsS2.ts — IFRS_S2_ADOPTION_COUNT for a slot with room for the\n` +
      `qualifier and the as-of date, IFRS_S2_SHORT for one without (it names no number at all),\n` +
      `IFRS_S2_STATUS_SENTENCE for the full posture, IFRS_S2_CITATION for the standard.\n` +
      `A BARE NUMBER IS THE DEFECT, not the wrong number. 28 and 36 are both correct and answer\n` +
      `different questions; a surface printing either alone is answering a question it never asked.\n`,
    ).toEqual([])
  })

  // ── PROOF THAT EACH PATTERN BITES ────────────────────────────────────────────────────────────────
  it('every forbidden pattern is caught when planted in code', () => {
    const plants: [string, string][] = [
      ['30+ form',      "  const a = 'adopted in 30+ jurisdictions'"],
      ['36+ form',      "  const b = 'IFRS S2 (ISSB)', '36+ jurisdictions', 'Adopted'"],
      ['globally',      "  jurisdiction: '30+ jurisdictions globally',"],
      ['dozens',        "  <p>going mandatory across dozens of jurisdictions</p>"],
      ['bare 28',       "  const c = '28 jurisdictions have adopted'"],
      ['bare 36',       "  const d = '36 jurisdictions and counting'"],
    ]
    for (const [label, line] of plants) {
      expect(scanLines(line), `${label} planted in code was NOT caught`).not.toEqual([])
    }
  })

  it('the constant itself would trip the guard — which is why its file is excluded', () => {
    // IFRS_S2_ADOPTION_COUNT contains '28 jurisdictions'. The exclusion of lib/ifrsS2.ts is therefore
    // LOAD-BEARING from day one, unlike lib/sb253.test.ts's, which was decorative until its
    // day-first patterns were added. Asserted so that removing the exclusion fails loudly here
    // rather than turning the source file into its own offender.
    expect(scanLines(`  const x = '${IFRS_S2_ADOPTION_COUNT}'`)).not.toEqual([])
  })

  it('IFRS_S2_SHORT is safe to print anywhere — it names no number', () => {
    // The compression rule the constant was designed around: what survives a chip is the SHAPE of the
    // fact, not the figure. If someone ever adds a number to IFRS_S2_SHORT, this fails.
    expect(scanLines(`  label: '${IFRS_S2_SHORT}'`)).toEqual([])
    // A COUNT, not any digit. 'IFRS S2' contains a 2 — the standard's own name — so a bare /\d/ test
    // fails on the correct value, which is how this assertion was first written and caught.
    expect(IFRS_S2_SHORT).not.toMatch(/\d+\+?\s*jurisdiction/i)
  })

  it('block comments are skipped in full, not just their first line', () => {
    const jsxBlock = [
      '          {/* It carries NO COUNT and NO DIRECTION OF TRAVEL; the previous version read',
      "              'going mandatory across dozens of jurisdictions' — a third spelling of a figure",
      '              the repo states as 28 and as 36. */}',
    ].join('\n')
    expect(scanLines(jsxBlock), 'a continuation line of a JSX comment was read as code').toEqual([])
    expect(scanLines("  <p>going mandatory across dozens of jurisdictions</p>")).not.toEqual([])
  })

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
