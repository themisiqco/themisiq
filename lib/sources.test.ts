import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// AN OUTBOUND LINK TO A REGULATOR IS A CLAIM, AND A CLAIM NOBODY CAN ENUMERATE IS A CLAIM NOBODY
// CHECKS.
//
// 25 regulatory URLs live across app/ and lib/. Twenty-two were call-site literals, and twenty-three
// of them sat on ONE page — app/frameworks/page.tsx — each rendered under the label "Official
// source ↗". That is the strongest sourcing claim any surface here makes: not "related reading" but a
// promise that the thing on the other end is the authority for the card above it.
//
// ⚠️ THE FAILURE MODE IS NOT 404, WHICH IS WHY THIS IS A STRUCTURAL GUARD AND NOT A LINK CHECKER.
// Both CARB links that broke RESOLVED — a real page, a real heading, the wrong or stale one. A
// request-based checker would have passed both. What catches that class is one place to look, one
// place to fix, and a comment per URL saying what it is meant to point at. THIS TEST ENFORCES THE
// FIRST OF THOSE THREE: every regulatory link must be a named constant in lib/sources.ts, so it has
// somewhere to carry its intent and its verification date.
//   The complement — actually opening them — is a hand-run script, deliberately NOT wired into
// `npm run build`. That command is the ship gate; making it depend on twenty-odd third-party hosts
// being up would teach everyone to bypass it, and a bypassed gate is worth less than none.
//
// Reads FILES FROM DISK, like the three date and posture guards. A URL in a template string
// type-checks perfectly and passes every other test in this repo.

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'lib']

// From the inventory. Suffix-matched, so subdomains are covered — 'files.sciencebasedtargets.org'
// matches on 'sciencebasedtargets.org', and any future 'www.' or country prefix is caught without a
// new entry. Deliberately EXCLUDES themisiq.co, Stripe, Resend, Anthropic and schema.org: those are
// internal routes and infrastructure, not sources, and a guard that fires on them would be noise.
const REGULATORY_HOSTS = [
  'arb.ca.gov',            // CARB — SB 253 / SB 261
  'ghgprotocol.org',
  'ifrs.org',
  'efrag.org',
  'cdp.net',
  'fsb-tcfd.org',
  'sciencebasedtargets.org',
  'globalreporting.org',
  'ecovadis.com',
  'europa.eu',             // covers commission., digital-strategy.ec., finance.ec., ecb.
  'calcivilrights.ca.gov',
  'nist.gov',
  'iso.org',
  'epa.gov',
]

const EXCLUDED_FILES = new Set([
  'lib/sources.ts',            // THE REGISTRY — this is where a regulatory URL is supposed to be
  'lib/sources.test.ts',       // this file names the hosts to forbid them
  'lib/sb253.ts',              // SB253_PROGRAMME_URL, re-exported by the registry; see its note there
  'lib/sb261.ts',              // SB261_DOCKET_URL, likewise
  // THE DATED ECB FX PDF. Its path encodes the fixing date — .../2026/07/20260701.pdf — so it is not
  // a stable source link but an artefact that must move whenever FX_AS_OF moves. lib/sources.ts
  // records the reasoning: lifting it into a registry would separate the URL from the date it dates,
  // and that file's own comment already says to bump both in one edit.
  'lib/deals/assessment.ts',
  // The SBTi CNZS criteria PDF, cited in a provenance comment beside the figures it sources.
  'lib/sbti/params.ts',
])

// Block-aware, matching lib/sb253.test.ts, lib/sb261.test.ts and lib/ifrsS2.test.ts. Only the FIRST
// line of a `/* … */` or `{/* … */}` carries a marker, and this repo's rationale comments run ten or
// fifteen lines — several quote URLs as the thing they replaced. A line-based check would read every
// continuation line as code and flag the comment explaining the fix.
// Bias preserved: a comment opened AFTER code on the same line does not make the line prose.
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

const URL_RE = /https?:\/\/([^/'"`)\s]+)/g

// Exported so the prove-it-bites tests run the SAME matcher over planted lines rather than a
// paraphrase of it.
export const scanLines = (src: string): string[] => {
  const comments = commentLineNumbers(src)
  const hits: string[] = []
  src.split('\n').forEach((line, i) => {
    if (comments.has(i + 1)) return
    for (const m of line.matchAll(URL_RE)) {
      const host = m[1].toLowerCase()
      // Suffix match, anchored on a dot boundary so 'notarb.ca.gov' cannot masquerade as 'arb.ca.gov'
      // and 'myiso.org' cannot masquerade as 'iso.org'.
      const hit = REGULATORY_HOSTS.find(h => host === h || host.endsWith('.' + h))
      if (hit) hits.push(`${i + 1}:${host}`)
    }
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

describe('regulatory links live in lib/sources.ts', () => {
  it('an "Official source" claim cannot be a call-site literal', () => {
    const offences: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split('\\').join('/')
        if (EXCLUDED_FILES.has(rel)) continue
        for (const hit of scanLines(readFileSync(file, 'utf8'))) {
          const cut = hit.indexOf(':')
          offences.push(`${rel}:${hit.slice(0, cut)} — ${hit.slice(cut + 1)}`)
        }
      }
    }

    expect(offences, offences.length === 0 ? '' :
      `Regulatory URL as a call-site literal:\n\n${offences.join('\n')}\n\n` +
      `TO FIX: import the named constant from lib/sources.ts, or add one there if the source is new.\n` +
      `WHY THE REGISTRY AND NOT A LINK CHECKER: both CARB links that broke returned 200. They pointed\n` +
      `at the wrong or stale page, which no request can detect. What detects it is a comment saying\n` +
      `what the URL is MEANT to point at, sitting beside the URL — and a literal has nowhere to put\n` +
      `one. The registry also carries a per-constant verification date, so "moved here" is never\n` +
      `mistaken for "checked".\n`,
    ).toEqual([])
  })

  // ── PROOF THAT EACH HOST CLASS BITES ─────────────────────────────────────────────────────────────
  //
  // A green scan is equally consistent with a matcher that catches nothing. lib/sb253.test.ts went
  // green for months while blind to the one spelling that mattered; these plant a literal per host
  // class and assert it is caught.
  it('every regulatory host class is caught when planted in code', () => {
    const plants: [string, string][] = [
      ['CARB',        `  href: 'https://ww2.arb.ca.gov/our-work/programs/climate-disclosure'`],
      ['GHG Protocol', `  href: 'https://ghgprotocol.org'`],
      ['IFRS',        `  href: 'https://www.ifrs.org/issued-standards/'`],
      ['EFRAG',       `  href: 'https://www.efrag.org'`],
      ['CDP',         `  href: 'https://www.cdp.net'`],
      ['TCFD',        `  href: 'https://www.fsb-tcfd.org/'`],
      ['SBTi',        `  href: 'https://sciencebasedtargets.org'`],
      ['SBTi files',  `  const p = 'https://files.sciencebasedtargets.org/production/x.pdf'`],
      ['GRI',         `  href: 'https://www.globalreporting.org'`],
      ['EcoVadis',    `  href: 'https://ecovadis.com'`],
      ['EC commission', `  href: 'https://commission.europa.eu/business-economy-euro/x_en'`],
      ['EC digital',  `  href: 'https://digital-strategy.ec.europa.eu/en/policies/nis2-directive'`],
      ['EC finance',  `  href: 'https://finance.ec.europa.eu/regulation-and-supervision/x_en'`],
      ['ECB',         `  const f = 'https://www.ecb.europa.eu/stats/eurofxref/x.pdf'`],
      ['CA civil rights', `  href: 'https://www.calcivilrights.ca.gov/paydatareporting/'`],
      ['NIST',        `  href: 'https://www.nist.gov/cyberframework'`],
      ['ISO',         `  href: 'https://www.iso.org/standard/27001'`],
      ['EPA',         `  href: 'https://www.epa.gov/egrid/power-profiler'`],
    ]
    for (const [label, line] of plants) {
      expect(scanLines(line), `${label} planted in code was NOT caught`).not.toEqual([])
    }
  })

  it('does NOT fire on internal routes or infrastructure — the crying-wolf check', () => {
    // A guard that flags the Stripe or Resend endpoint gets deleted as noisy, and the real regression
    // walks in afterwards. Same lesson lib/cs3d.test.ts records from its own bare `unit: '2027'`.
    const innocent = [
      `  <a href="https://www.themisiq.co/assess">`,
      `  await fetch('https://api.resend.com/emails', { method: 'POST' })`,
      `  const r = await fetch('https://api.anthropic.com/v1/messages')`,
      `  '@context': 'https://schema.org',`,
      `  checkoutUrl: 'https://buy.stripe.com/xxxx'`,
      `  href="https://dashboard.stripe.com/payments"`,
    ]
    for (const line of innocent) {
      expect(scanLines(line), `false positive: ${line.trim()}`).toEqual([])
    }
  })

  it('a lookalike host cannot masquerade as a regulatory one', () => {
    // Suffix matching is anchored on a dot boundary. Without that, 'notarb.ca.gov' and 'myiso.org'
    // would match and the guard would fire on hosts it has no business flagging.
    expect(scanLines(`  href: 'https://notarb.ca.gov/x'`)).toEqual([])
    expect(scanLines(`  href: 'https://myiso.org/x'`)).toEqual([])
    // …while a real subdomain still matches.
    expect(scanLines(`  href: 'https://ww2.arb.ca.gov/x'`)).not.toEqual([])
  })

  // ── THE EXCLUSIONS ARE TESTED, NOT ASSUMED ───────────────────────────────────────────────────────
  it('the dated ECB PDF would fire — the exclusion of lib/deals/assessment.ts is what stops it', () => {
    // Asserted from the REAL file content, not a paraphrase: if the exclusion were removed, this URL
    // is what would be flagged, and it must not be — the path encodes FX_AS_OF and belongs beside the
    // rate table it dates. Removing the exclusion should therefore be a deliberate act, and this test
    // is what makes it a visible one.
    const src = readFileSync(join(ROOT, 'lib/deals/assessment.ts'), 'utf8')
    expect(scanLines(src), 'the ECB PDF no longer appears — check FX_SOURCE before deleting this test')
      .not.toEqual([])
    expect(EXCLUDED_FILES.has('lib/deals/assessment.ts')).toBe(true)
  })

  it('the registry itself would fire — its exclusion is load-bearing from day one', () => {
    const src = readFileSync(join(ROOT, 'lib/sources.ts'), 'utf8')
    expect(scanLines(src)).not.toEqual([])
    expect(EXCLUDED_FILES.has('lib/sources.ts')).toBe(true)
  })

  it('block comments are skipped in full, not just their first line', () => {
    const jsxBlock = [
      '          {/* The CARB link here rotted to a 404. It pointed at',
      "              'https://ww2.arb.ca.gov/our-work/programs/climate-disclosure', which was the",
      '              programme page rather than the rulemaking record. */}',
    ].join('\n')
    expect(scanLines(jsxBlock), 'a continuation line of a JSX comment was read as code').toEqual([])
    expect(scanLines(`  href: 'https://ww2.arb.ca.gov/our-work/programs/climate-disclosure'`)).not.toEqual([])
  })

  it('scans a plausible number of files — a broken walk would pass vacuously', () => {
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })
})
