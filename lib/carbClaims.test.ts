import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { SB253_PLATFORM_SENTENCE, SB253_PLATFORM_SENTENCE_FIRST_USE } from './sb253'

// NO CLAIM THAT CARB TAKES A THEMISIQ FILE (calc-copy-3, Oct 2026). CARB has published only a draft, optional
// Scope 1 and 2 template (October 2025), and the SB 253 download is ThemisIQ's own CSV layout, which does not
// follow it. Until 4 Oct 2026 /climate-ghg, /frameworks and the assessment's obligation text said the export
// was "on the CARB template" or "pre-filled", which a reader takes as a filing CARB will accept. What a report
// does is said once, in SB253_PLATFORM_SENTENCE.
//
// Reads files from disk, as lib/sb253.test.ts does: the defect is textual. Comment lines are skipped
// (block-aware), because a comment recording what was removed has to be able to quote it.

const ROOT = join(__dirname, '..')
const SCAN_DIRS = ['app', 'lib']
const EXCLUDED_FILES = new Set(['lib/carbClaims.test.ts'])

const CARB = String.raw`(?:CARB|California Air Resources Board)`
const SB253 = String.raw`SB[\s-]?253`
const FORBIDDEN: Array<[string, RegExp]> = [
  ['CARB template', new RegExp(String.raw`\b${CARB}(?:\s+${SB253})?\s+template`, 'i')],
  ['SB 253 template', new RegExp(String.raw`\b${SB253}\s+template`, 'i')],
  ['pre-filled, SB 253 or CARB after', new RegExp(String.raw`pre-?filled[^.\n]{0,60}(?:${SB253}|${CARB})`, 'i')],
  ['pre-filled, SB 253 or CARB before', new RegExp(String.raw`(?:${SB253}|${CARB})[^.\n]{0,60}pre-?filled`, 'i')],
  ['acceptable by', /acceptable by/i],
  ['accepted by CARB', new RegExp(String.raw`accepted by (?:the )?${CARB}`, 'i')],
  ['approved by CARB', new RegExp(String.raw`approved by (?:the )?${CARB}`, 'i')],
  ['CARB-approved', new RegExp(String.raw`\b${CARB}[\s-]+approved`, 'i')],
]

const codeLines = (src: string): Array<[number, string]> => {
  const out: Array<[number, string]> = []
  let inBlock = false
  src.split('\n').forEach((line, i) => {
    const t = line.trim()
    if (inBlock) {
      if (t.includes('*/')) inBlock = false
      return
    }
    if (t.startsWith('//') || t.startsWith('*')) return
    if (t.startsWith('/*') || t.startsWith('{/*')) {
      if (!t.includes('*/')) inBlock = true
      return
    }
    out.push([i + 1, line])
  })
  return out
}

const offencesIn = (src: string, where: string): string[] => {
  const hits: string[] = []
  for (const [n, line] of codeLines(src)) {
    for (const [name, re] of FORBIDDEN) if (re.test(line)) hits.push(`${where}:${n} (${name})`)
  }
  return hits
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p)
  }
  return out
}

describe('no claim that CARB accepts a ThemisIQ file', () => {
  const files = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)))

  it('CB1: customer-facing copy names no CARB template, pre-filled export, or CARB acceptance', () => {
    const offences: string[] = []
    for (const file of files) {
      const rel = relative(ROOT, file).split('\\').join('/')
      if (EXCLUDED_FILES.has(rel)) continue
      offences.push(...offencesIn(readFileSync(file, 'utf8'), rel))
    }
    expect(offences).toEqual([])
  })

  it('CB2: every forbidden pattern is caught when planted', () => {
    const plants: Array<[string, string]> = [
      ['CARB template', "  fw: 'SB 253 · CDP C6 · CARB template · SBTi',"],
      ['CARB SB 253 template', "  note: 'One inventory exports to CARB SB 253 template, CDP C6 and C7.'"],
      ['spelled-out agency', '  <p>Exports on the California Air Resources Board template.</p>'],
      ['SB 253 template', "  maps: 'Exports straight onto the SB 253 template.'"],
      ['pre-filled before', "  'Pre-filled CARB SB 253 export, plus CDP, ESRS E1 and EcoVadis.'"],
      ['pre-filled after', "  maps: 'One-click SB 253 emissions export, pre-filled from your inventory.'"],
      ['acceptable by', '  <p>A file acceptable by the regulator.</p>'],
      ['accepted by CARB', '  <p>Reports accepted by CARB.</p>'],
      ['approved by CARB', '  <p>A format approved by the California Air Resources Board.</p>'],
      ['CARB-approved', "  action: 'Start the inventory using the CARB-approved GHG Protocol methodology.' })"],
      ['CARB approved', '  <p>Built on the CARB approved methodology.</p>'],
      ['agency-approved', '  <p>Uses the California Air Resources Board-approved method.</p>'],
    ]
    for (const [name, line] of plants) expect(offencesIn(line, 'plant'), name).not.toEqual([])
  })

  it('CB3: unrelated "pre-filled" copy and comments are not flagged', () => {
    const allowed = [
      "  hint: 'Pre-filled with Public Safety Canada\\'s example. You may edit it.' },",
      '  The reduction % is pre-filled with the SBTi ACA-suggested rate.',
      "  // Until Oct 2026 this said 'exports it on the CARB template'.",
      '  /* note: Pre-filled CARB SB 253 export',
      '     was the old wording */',
    ].join('\n')
    expect(offencesIn(allowed, 'allowed')).toEqual([])
  })

  it('CB4: the platform sentence is the ruled text, and the first-use form only spells out the agency', () => {
    expect(SB253_PLATFORM_SENTENCE).toBe(
      "Your ThemisIQ report gives you the Scope 1 and Scope 2 figures to enter on CARB's SB 253 reporting platform, built on the GHG Protocol and traceable to your source documents where you've uploaded them.",
    )
    expect(SB253_PLATFORM_SENTENCE_FIRST_USE).toContain('the California Air Resources Board (CARB) SB 253 reporting platform')
    expect(SB253_PLATFORM_SENTENCE_FIRST_USE.replace('the California Air Resources Board (CARB) SB 253', "CARB's SB 253"))
      .toBe(SB253_PLATFORM_SENTENCE)
  })

  it('CB5: /climate-ghg and /calculate-emissions use the sentence', () => {
    for (const f of ['app/climate-ghg/page.tsx', 'app/calculate-emissions/page.tsx']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).toContain('SB253_PLATFORM_SENTENCE_FIRST_USE}')
    }
  })

  it('CB6: scans a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(200)
  })
})
