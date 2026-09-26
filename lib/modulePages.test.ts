import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { MODULE_SUBLINE, EVIDENCE_BY_MODULE, evidenceClaim, hasVerifierSurface } from './modulePages'
import { MODULES, type ModuleKey } from './pricing'

/**
 * The claims the seven module marketing pages share. Two things are asserted: that the sub-line is
 * imported rather than retyped, and that a page cannot make a verifier claim it has no surface for.
 *
 * ⚠️ THE VERIFIER HALF IS THE ONE THAT MATTERS. "Your verifier can check the figures back to source" is
 * true for GHG and CBAM, plus Scope 3 Category 1 behind a per-grant opt-in, and false for the other
 * five: get_verifier_inventory and get_verifier_scope3 are the only RPCs, app/verify/[token] and
 * app/verify-cbam/[token] the only pages. Seven hand-written evidence paragraphs would make a wrong
 * claim likely, so EvidenceSection takes a moduleKey and no paragraph prop.
 */

const ROOT = process.cwd()

/**
 * Marketing page per module key. `double-materiality` is /materiality, and GHG's page is /climate-ghg
 * rather than /ghg — neither route matches its key, which is why this map is explicit.
 */
const PAGE_BY_MODULE: Record<ModuleKey, string> = {
  ghg: 'app/climate-ghg/page.tsx',
  cbam: 'app/cbam/page.tsx',
  'climate-risk': 'app/climate-risk/page.tsx',
  'double-materiality': 'app/materiality/page.tsx',
  'supply-chain': 'app/supply-chain/page.tsx',
  people: 'app/people/page.tsx',
  deals: 'app/deals/page.tsx',
  'ai-governance': 'app/ai-governance/page.tsx',
  cyber: 'app/cyber/page.tsx',
}

/**
 * Pages rebuilt to the shared module shape. ⚠️ ONE MEMBER TODAY, AND THE LIST IS THE POINT: Climate
 * Risk was built first, alone, so the shape could be settled before it was repeated six times. As each
 * page is converted its key moves here in the same commit, and the assertions below fail until it does.
 * A converted page that does NOT import MODULE_SUBLINE fails, and an unconverted page that somehow
 * imports it fails too — so the list cannot quietly fall behind reality in either direction.
 */
const CONVERTED: ModuleKey[] = ['ai-governance', 'cbam', 'climate-risk', 'deals', 'ghg', 'people', 'supply-chain']

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('the shared module-page claims cannot drift across seven pages', () => {
  it('every module key has a marketing page, and every page exists', () => {
    const keys = MODULES.map(m => m.key).sort()
    expect(Object.keys(PAGE_BY_MODULE).sort(), 'PAGE_BY_MODULE has drifted from MODULES in lib/pricing.ts')
      .toEqual(keys)
    const missing = Object.entries(PAGE_BY_MODULE).filter(([, p]) => !existsSync(join(ROOT, p)))
      .map(([k, p]) => `${k} -> ${p}`)
    expect(missing, missing.length === 0 ? '' : `page file not found:\n  ${missing.join('\n  ')}`).toEqual([])
  })

  it('the sub-line is one string, and it names a person rather than a product', () => {
    expect(MODULE_SUBLINE).toBe('Self-guided, or with advisors at the ready.')
    // ⚠️ "human" IS RESERVED FOR DESCRIBING A PERSON. "human-led", "human-in-the-loop" and
    // "human-powered" are product claims wearing a person's clothes, and this is the sub-line that
    // appears on all seven pages, so it is the worst place for one.
    expect(MODULE_SUBLINE.toLowerCase()).not.toContain('human')
    expect(MODULE_SUBLINE).not.toContain('—')
  })

  it('every converted page imports MODULE_SUBLINE instead of retyping it', () => {
    const bad: string[] = []
    for (const key of CONVERTED) {
      const p = PAGE_BY_MODULE[key]
      const src = read(p)
      if (!/import\s*\{[^}]*\bMODULE_SUBLINE\b[^}]*\}\s*from\s*['"][^'"]*modulePages['"]/.test(src)) {
        bad.push(`${p} does not import MODULE_SUBLINE from lib/modulePages`)
      }
      // The literal being present as well means someone pasted it beside the import.
      if (src.includes('Self-guided, or with advisors')) {
        bad.push(`${p} contains the sub-line as a LITERAL. Render {MODULE_SUBLINE}, do not retype it.`)
      }
    }
    expect(bad, bad.length === 0 ? '' :
      `${bad.join('\n  ')}\n\nThe repetition across seven pages is deliberate, which is exactly why it ` +
      'cannot be seven strings: app/components/buttonStyles.ts exists because thirteen files each ' +
      'declared their own identical button and a miss was invisible.').toEqual([])
  })

  it('CONVERTED matches reality in both directions', () => {
    const importsSubline = (Object.keys(PAGE_BY_MODULE) as ModuleKey[]).filter(k => {
      const p = join(ROOT, PAGE_BY_MODULE[k])
      return existsSync(p) && /\bMODULE_SUBLINE\b/.test(readFileSync(p, 'utf8'))
    }).sort()
    expect(importsSubline, 'CONVERTED does not match the pages that actually use MODULE_SUBLINE. Move ' +
      'the key in the same commit as the page, so a conversion is visible in the diff.')
      .toEqual([...CONVERTED].sort())
  })

  it('only GHG and CBAM are marked as having a verifier surface', () => {
    // ⚠️ ASSERTED AS AN EXACT SET, NOT A MINIMUM. A sixth module gaining `verifier` here without an RPC
    // and a /verify page behind it is the defect this exists to stop, and it would read as an
    // improvement in a diff.
    const withVerifier = (Object.keys(EVIDENCE_BY_MODULE) as ModuleKey[])
      .filter(hasVerifierSurface).sort()
    expect(withVerifier, 'the verifier claim is true for GHG and CBAM only. There are two verifier RPCs ' +
      '(get_verifier_inventory, get_verifier_scope3) and two verifier pages (app/verify/[token], ' +
      'app/verify-cbam/[token]). Adding a module here without one is a claim to an outside auditor that ' +
      'the product cannot honour.').toEqual(['cbam', 'ghg'])
  })

  it('every module key has an evidence kind, and no key is missing one', () => {
    const keys = MODULES.map(m => m.key).sort()
    expect(Object.keys(EVIDENCE_BY_MODULE).sort(),
      'EVIDENCE_BY_MODULE has drifted from MODULES. It is a Record<ModuleKey, …> so tsc should have ' +
      'caught this first; if this fires, the type has been loosened.').toEqual(keys)
  })

  it('the workings claim never mentions an audit trail, because five modules do not have one', () => {
    // ⚠️ THE NEAR-MISS THIS PINS. The brief for this work called the non-verifier paragraph "the
    // audit-trail paragraph, which is true everywhere". It is not. Checked against the migrations on
    // 25 Sep 2026: audit_log triggers exist on ghg_inventories, cbam_production_processes and
    // cbam_installation_disclosures, and nowhere else. Climate Risk, Materiality, People, Cyber, AI
    // Governance and Deals write no audit_log rows, so a page of theirs claiming an audit trail would
    // assert a database object that does not exist for it. CLAUDE.md records the same defect on the
    // homepage, where the platform-wide version of that claim was false.
    const forbidden = ['audit trail', 'audit log', 'audit-log', 'append-only', 'database trigger']
    const bad: string[] = []
    for (const key of Object.keys(EVIDENCE_BY_MODULE) as ModuleKey[]) {
      if (hasVerifierSurface(key)) continue
      const claim = evidenceClaim(key).toLowerCase()
      for (const f of forbidden) if (claim.includes(f)) bad.push(`${key}: claims "${f}"`)
    }
    expect(bad, bad.length === 0 ? '' :
      `a non-verifier module claims an audit log it does not have:\n  ${bad.join('\n  ')}\n\n` +
      'Only ghg_inventories, cbam_production_processes and cbam_installation_disclosures carry an ' +
      'audit_log trigger. The claim that IS true everywhere is about workings: the inputs and the ' +
      'method are kept and shown.').toEqual([])
  })

  it('the verifier claim names its actual scope, and the workings claim does not overreach', () => {
    const v = evidenceClaim('ghg')
    expect(v, 'the verifier claim must name the opt-in, because Scope 3 Category 1 is behind a per-grant ' +
      'consent flag rather than included by default').toContain('opted in')
    expect(v).toContain('revoke')

    const w = evidenceClaim('climate-risk')
    expect(w.toLowerCase(), 'a non-verifier module must not use the word verifier at all')
      .not.toContain('verifier')
  })
})
