import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as sources from './sources'

/**
 * lib/sources.ts holds every external URL the product shows a customer as an authority — most visibly
 * as "Official source ↗" on app/frameworks/page.tsx, beside a claim about what a regulation requires.
 *
 * ⚠️ THE DEFECT THIS EXISTS TO CATCH IS A DEAD LINK, AND NOTHING ELSE IN THE BUILD CAN SEE ONE.
 * On 25 Sep 2026 DORA_COMMISSION_URL was found to be a 404, and had been since the constant was
 * created. tsc passed, the tests passed, next build passed, and the card rendered a link to nothing —
 * a URL is only a string, exactly like a retired model string. A reader who clicks a 404 has been given
 * the same thing as a stale date: a checkable claim that turns out false, on the one surface whose
 * purpose is to be checkable.
 *
 * ⚠️ THIS IS THE SIBLING OF lib/sources.test.ts, AND THEY GUARD OPPOSITE HALVES. That file asserts that
 * an "Official source" URL cannot be a CALL-SITE LITERAL — it scans the codebase for regulatory hosts
 * planted outside this registry. This file asserts that what IS in the registry is well-formed and
 * accounted for. Centralisation without provenance gives you one tidy list of dead links; provenance
 * without centralisation gives you a verified list that half the code ignores. Neither file replaces the
 * other, and a URL problem could be in either.
 *
 * ⚠️ THIS FILE CANNOT FETCH, AND THAT IS DELIBERATE. CI has no network, and a test that made twenty-four
 * HTTP requests would fail on someone's flaky wifi and teach the team to ignore it. So it asserts what
 * is checkable offline: the SHAPE of every value, and the BOOKKEEPING of which ones a human has actually
 * opened. Liveness is a manual sweep — docs/backlog.md carries the method, including that a bare curl
 * gets 403 from sites that are perfectly alive.
 */

const ROOT = process.cwd()
const SRC_PATH = 'lib/sources.ts'
const src = readFileSync(join(ROOT, SRC_PATH), 'utf8')

type Status = 'unverified' | 'resolves' | 'form-verified' | 'verified'

/**
 * The expected @source-status for every constant, as of 25 Sep 2026.
 *
 * ⚠️ THIS LIST IS THE TEETH. Without it the tag would be a comment like any other, and "clear the
 * UNVERIFIED marker" would be a one-character edit nobody reviews. With it, moving a constant up to
 * `verified` — a claim about having READ a page — fails until someone edits this list in the same
 * commit, where a reviewer sees it.
 *
 * ⚠️ `resolves` IS NOT A PASS, IT IS A FETCH. Eighteen constants sit there: each returned HTTP 200 on
 * 25 Sep 2026 and NOT ONE has had its page read against the claim its comment makes. Several of those
 * comments assert things a fetch cannot check — CS3D_COMMISSION_URL is described as the page the
 * thresholds framing rests on, and EU_AI_ACT_URL's comment mentions "two application dates". Whether
 * those pages still say that needs a person. Do not read a green test as a verified file.
 *
 * ⚠️ ONLY TWO ARE `verified`. EPA_USEEIO_URL is the model: its comment records what the page said and
 * what it FAILED to say, which is why three fields on that source record are null. ISO_27001_URL was
 * opened by hand on 25 Sep 2026, settling that iso.org's /standard/<number> vanity path works and that
 * /standard/<catalogue-id>.html is the convention — which is what licenses `form-verified` for the
 * other two ISO links, since iso.org 403s every automated client regardless of headers.
 */
const EXPECTED: Record<string, Status> = {
  EPA_USEEIO_URL: 'verified',
  ISO_27001_URL: 'verified',

  ISO_14064_3_URL: 'form-verified',
  ISO_42001_URL: 'form-verified',

  CBAM_REGULATION_URL: 'resolves',
  CBAM_COMMISSION_URL: 'resolves',
  SECR_GUIDANCE_URL: 'resolves',
  DORA_REGULATION_URL: 'resolves',
  EFRAG_HOME_URL: 'resolves',
  GRI_HOME_URL: 'resolves',
  GHG_PROTOCOL_URL: 'resolves',
  IFRS_S2_STANDARD_URL: 'resolves',
  TCFD_URL: 'resolves',
  CDP_URL: 'resolves',
  SBTI_URL: 'resolves',
  CS3D_COMMISSION_URL: 'resolves',
  EU_AI_ACT_URL: 'resolves',
  NIS2_COMMISSION_URL: 'resolves',
  NIST_AI_RMF_URL: 'resolves',
  NIST_CSF_URL: 'resolves',
  ECOVADIS_URL: 'resolves',
  CA_PAY_DATA_URL: 'resolves',

  // Never checked. SBTI_NET_ZERO_STANDARD_URL has no rendered call site by its own comment, which is
  // why it is the lowest priority of the two rather than the most urgent.
  SBTI_NET_ZERO_STANDARD_URL: 'unverified',
  EPA_EGRID_POWER_PROFILER_URL: 'unverified',
}

const STATUSES: Status[] = ['unverified', 'resolves', 'form-verified', 'verified']

/** Every exported constant with its literal value. The value may sit on the line after the `=`. */
function exported(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/export const ([A-Z0-9_]+)\s*(?::\s*string)?\s*=\s*\n?\s*'([^']+)'/g)) {
    out[m[1]] = m[2]
  }
  return out
}

/** The @source-status tag immediately above each constant, if any. */
function tags(): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = src.split('\n')
  lines.forEach((l, i) => {
    const m = /^export const ([A-Z0-9_]+)/.exec(l)
    if (!m) return
    const above = (lines[i - 1] ?? '').trim()
    const t = /^\/\/ @source-status:\s*(\S+)(?:\s+(\S+))?\s*$/.exec(above)
    if (t) out[m[1]] = t[2] ? `${t[1]} ${t[2]}` : t[1]
  })
  return out
}

describe('lib/sources.ts holds well-formed, accounted-for external URLs', () => {
  it('is readable and exports what the rest of the file assumes', () => {
    const all = exported()
    expect(Object.keys(all).length).toBeGreaterThan(20)
    // Every export is a URL constant. If a non-URL export is ever added here, the naming assumption
    // below stops holding and this is where it surfaces.
    const misnamed = Object.keys(all).filter(n => !n.endsWith('_URL')).sort()
    expect(misnamed, misnamed.length === 0 ? '' :
      `${misnamed.join(', ')} do not end in _URL. Every export in this file is an external source URL; ` +
      'if that is changing, the https and status checks below need to exclude them explicitly.').toEqual([])
  })

  it('every URL is https', () => {
    // These are shown to a customer as the authority behind a compliance claim. http would mean the
    // browser warns on the one link whose job is to be trustworthy, and several are government hosts
    // that redirect anyway — so a stray http would silently become an extra hop.
    const bad = Object.entries(exported())
      .filter(([, v]) => !v.startsWith('https://'))
      .map(([n, v]) => `${n} = ${v}`)
    expect(bad, bad.length === 0 ? '' : `not https:\n  ${bad.join('\n  ')}`).toEqual([])
  })

  it('no two constants hold the same URL under different names', () => {
    // ⚠️ TWO NAMES FOR ONE URL MEANS A FIX REACHES ONE CALL SITE AND NOT THE OTHER. That is exactly how
    // lib/pdf/palette.ts came to exist: assurancePdf.ts and layout.ts each kept their own grey, one was
    // below AA, and the rejection written in one module never reached the other. EFRAG_HOME_URL is the
    // live example of the right shape — four entries on app/frameworks/page.tsx share ONE constant, so
    // adding the /en path segment fixed all four at once.
    const byValue = new Map<string, string[]>()
    for (const [n, v] of Object.entries(exported())) {
      const k = v.replace(/\/$/, '').toLowerCase()
      byValue.set(k, [...(byValue.get(k) ?? []), n])
    }
    const dupes = [...byValue.entries()].filter(([, ns]) => ns.length > 1)
      .map(([v, ns]) => `${ns.sort().join(' and ')} both hold ${v}`)
    expect(dupes, dupes.length === 0 ? '' :
      `the same URL is exported under more than one name:\n  ${dupes.join('\n  ')}\n\n` +
      'Keep one constant and point every call site at it, so a correction reaches all of them. Trailing ' +
      'slashes and case are ignored here, because those differences do not make two links different.').toEqual([])
  })

  it('every URL carries an @source-status tag with a value from the vocabulary', () => {
    const all = Object.keys(exported()).sort()
    const t = tags()
    const missing = all.filter(n => !t[n])
    expect(missing, missing.length === 0 ? '' :
      `no @source-status tag above: ${missing.join(', ')}.\n\n` +
      'Add one directly above the constant, e.g. "// @source-status: resolves 2026-09-25". The four ' +
      `values are ${STATUSES.join(', ')} and the block at the top of ${SRC_PATH} defines them. A new URL ` +
      'with no provenance is how the dead DORA link survived for months.').toEqual([])

    const bad = all.filter(n => t[n] && !STATUSES.includes(t[n].split(' ')[0] as Status))
      .map(n => `${n}: "${t[n]}"`)
    expect(bad, bad.length === 0 ? '' :
      `@source-status value not in the vocabulary:\n  ${bad.join('\n  ')}\n\n` +
      `Use one of: ${STATUSES.join(', ')}.`).toEqual([])

    // A date is required on everything except `unverified`, which by definition has no check date.
    const undated = all.filter(n => {
      const [st, date] = (t[n] ?? '').split(' ')
      return st !== 'unverified' && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
    })
    expect(undated, undated.length === 0 ? '' :
      `@source-status needs an ISO date saying WHEN it was checked: ${undated.join(', ')}.\n\n` +
      'A status with no date ages invisibly, which is the failure this whole file is about. Only ' +
      '`unverified` may omit it, because nothing was checked.').toEqual([])
  })

  it('every status matches EXPECTED, so clearing a marker cannot be a quiet edit', () => {
    // ⚠️ THE ASSERTION THIS FILE EXISTS FOR. Both directions: a constant whose tag has moved fails, and
    // a constant listed here that no longer exists fails too.
    const t = tags()
    const actual = Object.fromEntries(Object.keys(exported()).map(n => [n, (t[n] ?? '').split(' ')[0]]))

    const moved = Object.keys(actual).filter(n => EXPECTED[n] && actual[n] !== EXPECTED[n])
      .map(n => `${n}: expected ${EXPECTED[n]}, file says ${actual[n] || '(no tag)'}`)
    expect(moved, moved.length === 0 ? '' :
      `an @source-status changed without EXPECTED being updated:\n  ${moved.join('\n  ')}\n\n` +
      'If you genuinely OPENED the page and the content matches what the comment claims, update ' +
      `EXPECTED in this file in the same commit and say so in the comment above the constant — that is ` +
      'the visible act this check is here to force. If you only fetched it and got 200, the status is ' +
      '`resolves`, NOT `verified`: a live page about the wrong regulation reads as confirmation and is ' +
      'worse than a 404.').toEqual([])

    const unlisted = Object.keys(actual).filter(n => !EXPECTED[n]).sort()
    expect(unlisted, unlisted.length === 0 ? '' :
      `new URL constant(s) not in EXPECTED: ${unlisted.join(', ')}. Add each with the status you can ` +
      'honestly claim for it.').toEqual([])

    const ghosts = Object.keys(EXPECTED).filter(n => !(n in actual)).sort()
    expect(ghosts, ghosts.length === 0 ? '' :
      `EXPECTED lists ${ghosts.join(', ')}, which ${SRC_PATH} no longer exports. Remove them, and check ` +
      'no call site still wants the URL.').toEqual([])
  })

  it('the module actually loads and its exports are the strings the source text says', () => {
    // The checks above read SOURCE TEXT, so they would pass on a file that does not compile or whose
    // values are computed. This pins the two together.
    const all = exported()
    const asModule = sources as unknown as Record<string, unknown>
    const mismatched = Object.entries(all)
      .filter(([n, v]) => asModule[n] !== v)
      .map(([n, v]) => `${n}: source text says ${v}, module exports ${String(asModule[n])}`)
    expect(mismatched, mismatched.length === 0 ? '' :
      `source text and runtime value disagree:\n  ${mismatched.join('\n  ')}`).toEqual([])
  })
})
