import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ACCESS_NO_STANDING, ACCESS_BY_NAME } from './disclosures'

// THE CLAIM THAT WAS PUBLISHED TWICE AND AGREED WITH ITSELF ONLY BY LUCK.
//
// /trust and /security both tell a customer who can reach their data. For months they disagreed:
// /trust said "ThemisIQ staff cannot access your inventory data without your explicit request for
// support purposes", implying a support organisation, while /security said there was none. The fix
// wrote the corrected sentence into both files by hand, one saying "your data" and the other
// "customer data" — two copies of one claim, already drifting on the day they were written.
//
// ⚠️ THE SOURCE SCAN IS THE POINT OF THIS FILE. The import assertions below would also pass if
// someone imported the constant AND pasted the sentence in somewhere else. Only the scan over app/
// makes a second copy impossible to introduce quietly.

const ROOT = process.cwd()
const APP = join(ROOT, 'app')

const SENTENCES = [
  { name: 'ACCESS_NO_STANDING', text: ACCESS_NO_STANDING },
  { name: 'ACCESS_BY_NAME', text: ACCESS_BY_NAME },
]

// Near-misses, not just exact pastes. "customer data" vs "your data" is precisely how the two pages
// drifted last time, and a scan for the full sentence would have let that through. Each fragment is
// distinctive enough that it cannot occur in unrelated copy.
const FRAGMENTS = [
  'support organisation with standing access',
  'administers the platform on our behalf',
  'granted by name, not by role',
]

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full)
    return /\.(tsx?|jsx?|mdx?|json)$/.test(entry) ? [full] : []
  })

const FILES = walk(APP)

describe('disclosures published on more than one page have exactly one copy', () => {
  it('D1 the scan is looking at real files', () => {
    // A walk that silently returns nothing would make every assertion below vacuous.
    expect(FILES.length, 'no source files found under app/ — the scan is testing nothing').toBeGreaterThan(50)
    expect(FILES.some(f => f.endsWith('app/trust/page.tsx'))).toBe(true)
    expect(FILES.some(f => f.endsWith('app/security/page.tsx'))).toBe(true)
  })

  for (const { name, text } of SENTENCES) {
    it(`D2 ${name} appears nowhere under app/ as a hardcoded string`, () => {
      const offenders = FILES
        .filter(f => readFileSync(f, 'utf8').includes(text))
        .map(f => relative(ROOT, f))
      expect(
        offenders,
        `${name} is published on more than one page. Import it from lib/disclosures.ts instead of ` +
        'writing it out — a second copy is how /trust and /security came to say different things.',
      ).toEqual([])
    })
  }

  it('D3 no near-miss variant either', () => {
    for (const fragment of FRAGMENTS) {
      const offenders = FILES
        .filter(f => readFileSync(f, 'utf8').includes(fragment))
        .map(f => relative(ROOT, f))
      expect(
        offenders,
        `"${fragment}" is a fragment of a shared disclosure. An edited copy is still a copy: the ` +
        'last drift was one page saying "customer data" where the other said "your data".',
      ).toEqual([])
    }
  })

  it('D4 both call sites still import what they render', () => {
    // Without this, deleting the sentence from a page passes D2 trivially.
    const trust = readFileSync(join(APP, 'trust/page.tsx'), 'utf8')
    expect(trust, '/trust must import from lib/disclosures').toContain("from '../../lib/disclosures'")
    expect(trust).toContain('${ACCESS_NO_STANDING}')
    expect(trust).toContain('${ACCESS_BY_NAME}')

    const security = readFileSync(join(APP, 'security/page.tsx'), 'utf8')
    expect(security, '/security must import from lib/disclosures').toContain("from '@/lib/disclosures'")
    expect(security).toContain('${ACCESS_NO_STANDING}')
    // ACCESS_BY_NAME is deliberately NOT on /security: that page has never published an access
    // lifecycle claim, and adding one here would be a new statement, not a refactor. If it is ever
    // added, it must come from the constant — D3 makes pasting it impossible.
  })

  it('D5 lib/disclosures.ts holds exactly one copy of each', () => {
    const src = readFileSync(join(ROOT, 'lib/disclosures.ts'), 'utf8')
    for (const { name, text } of SENTENCES) {
      expect(src.split(text).length - 1, `${name} should appear once in lib/disclosures.ts`).toBe(1)
    }
  })
})
