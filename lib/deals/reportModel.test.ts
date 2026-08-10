import { describe, it, expect } from 'vitest'
import {
  makeMapFramework, regimeLabel, cs3dToken, CS3D_NOT_ASSESSED_LABEL,
  type RegimeToken,
} from './reportModel'
import { getFrameworkApplicability, getApplicableFrameworks, type FrameworkApplicability } from './assessment'

// Covers the token side of a risk finding's Framework column: makeMapFramework, cs3dToken and
// regimeLabel. These had NO coverage while they returned a joined string, which is how a consumer
// came to recover framework identity by re-splitting that string — and how 'ESRS E1', whose display
// text and identity differ, came to miss the lookup entirely.
//
// Tests assert the CONTRACT — token identity, caveat flag, dedupe rule — never the rendered wording
// of a reason sentence; those live with the engine in assessment.test.ts.

// A deal whose CSRD row APPLIES outright: 1,850 employees and EUR 620m both clear the post-Omnibus
// limbs (>1,000 and >EUR 450m) by a wide margin, so no limb is marginal and CSRD is a plain 'applies'.
const euDeal = (revenue: number, employee_count: number) => {
  const args = ['European Union', revenue, 'Technology', 'ma', 'EUR', { employee_count }] as const
  return {
    applicability: getFrameworkApplicability(...args),
    frameworks: getApplicableFrameworks(...args),
  }
}

const cs3dRowOf = (rows: FrameworkApplicability[]) => rows.find(f => f.framework === 'CS3D')

// The citedNear lookup EXACTLY as app/dashboard/deals/page.tsx:657-666 performs it: identity, not
// display text; undefined identities skipped; deduped by framework through a Map.
const citedNear = (tokens: RegimeToken[], rows: FrameworkApplicability[]): FrameworkApplicability[] => {
  const nearByFramework = new Map(rows.filter(r => r.status === 'near-threshold').map(f => [f.framework, f]))
  return [...new Map(
    tokens
      .map(t => (t.framework ? nearByFramework.get(t.framework) : undefined))
      .filter(Boolean)
      .map(f => [f!.framework, f!] as const),
  ).values()]
}

describe('RegimeToken — identity is carried separately from display text', () => {
  // (a)
  it('ESRS E1 carries identity CSRD and text ESRS E1 — the two differ, which is the whole point', () => {
    const { applicability, frameworks } = euDeal(620_000_000, 1_850)
    const tokens = makeMapFramework(frameworks, cs3dRowOf(applicability))('CSRD')
    const esrs = tokens.find(t => t.text === 'ESRS E1')
    expect(esrs).toBeDefined()
    expect(esrs!.framework).toBe('CSRD')
    expect(esrs!.text).toBe('ESRS E1')
    // Its sibling is the self-licensing case, where the two coincide.
    expect(tokens.find(t => t.text === 'CSRD')!.framework).toBe('CSRD')
  })

  // (f)
  it('a pass-through token carries NO identity — including one that happens to be a framework name', () => {
    const { applicability, frameworks } = euDeal(620_000_000, 1_850)
    const map = makeMapFramework(frameworks, cs3dRowOf(applicability))

    // Not a framework name, and never was.
    expect(map('EU AI Act')).toEqual([{ text: 'EU AI Act' }])

    // DELIBERATE BEHAVIOUR CHANGE. 'EU Taxonomy' IS a framework the engine emits — and it applies on
    // this very deal — but makeMapFramework has no arm for it, so it passes through as display text
    // with no identity. Under the old joined string it matched a near-threshold lookup by NAME
    // COINCIDENCE. Name coincidence no longer confers identity: identity is declared, or absent.
    expect(frameworks).toContain('EU Taxonomy')
    expect(map('EU Taxonomy')).toEqual([{ text: 'EU Taxonomy' }])
    expect(map('EU Taxonomy')[0].framework).toBeUndefined()
  })

  // (e)
  it('regimeLabel joins on " / " and is the only thing that does', () => {
    expect(regimeLabel([{ text: 'CSRD', framework: 'CSRD' }, { text: 'ESRS E1', framework: 'CSRD' }]))
      .toBe('CSRD / ESRS E1')
    expect(regimeLabel([{ text: 'EU AI Act' }])).toBe('EU AI Act')
    expect(regimeLabel([])).toBe('')
  })
})

describe('makeMapFramework — dedupe', () => {
  // (c)
  it('dedupes on TEXT, not object identity — a reference compare would keep both', () => {
    const { applicability, frameworks } = euDeal(620_000_000, 1_850)
    // 'CSRD' expands to the licensed regime, which already contains an ESRS E1 token; the second
    // input token is a PASS-THROUGH 'ESRS E1', so the same text arrives from two different arms as
    // two DISTINCT OBJECTS.
    const tokens = makeMapFramework(frameworks, cs3dRowOf(applicability))('CSRD / ESRS E1')

    const esrs = tokens.filter(t => t.text === 'ESRS E1')
    expect(esrs).toHaveLength(1)
    // The IDENTITY-BEARING one survives; the bare pass-through duplicate is the one dropped.
    expect(esrs[0].framework).toBe('CSRD')

    // Why `arr.indexOf(t) === i` could not have done this: the two tokens are separate objects, so a
    // reference compare finds no duplicate and keeps both. The string version of that line worked
    // only because strings compare by value.
    const asEmitted: RegimeToken[] = [{ text: 'ESRS E1', framework: 'CSRD' }, { text: 'ESRS E1' }]
    expect(asEmitted.filter((t, i, arr) => arr.indexOf(t) === i)).toHaveLength(2)
    expect(asEmitted.filter((t, i, arr) => arr.findIndex(o => o.text === t.text) === i)).toHaveLength(1)
  })
})

describe('citedNear resolves by identity', () => {
  // (b)
  it('a finding citing CSRD / ESRS E1 resolves to ONE near-threshold row, not two', () => {
    // 1,050 employees is 5% over the 1,000 limb and DECISIVE (drop it and CSRD no longer reaches
    // 2 of 2), so CSRD is near-threshold. EUR 600m keeps the turnover limb clear and unmarginal.
    const { applicability, frameworks } = euDeal(600_000_000, 1_050)
    expect(applicability.find(f => f.framework === 'CSRD')!.status).toBe('near-threshold')

    const tokens = makeMapFramework(frameworks, cs3dRowOf(applicability))('SB 253 / CSRD')
    // Both emitted tokens carry identity 'CSRD' — this is the setup for the double-count.
    expect(tokens.filter(t => t.framework === 'CSRD')).toHaveLength(2)

    const cited = citedNear(tokens, applicability)
    expect(cited).toHaveLength(1)
    expect(cited[0].framework).toBe('CSRD')
  })
})

describe('cs3dToken — four row conditions, both display strings, one identity', () => {
  const row = (over: Partial<FrameworkApplicability>): FrameworkApplicability =>
    ({ framework: 'CS3D', applies: false, status: 'not-assessed', ...over })

  // (d)
  it('applies → plain CS3D, not qualified', () => {
    const t = cs3dToken(row({ applies: true, status: 'applies' }))!
    expect(t.text).toBe('CS3D')
    expect(t.framework).toBe('CS3D')
    expect(t.qualified).toBeUndefined()
  })

  it('not-applicable → no token at all', () => {
    expect(cs3dToken(row({ status: 'not-applicable' }))).toBeNull()
  })

  it('near-threshold → CS3D (near threshold), qualified', () => {
    const t = cs3dToken(row({ status: 'near-threshold' }))!
    expect(t.text).toBe('CS3D (near threshold)')
    expect(t.framework).toBe('CS3D')
    expect(t.qualified).toBe(true)
    // The distinction this whole shape exists for: an EVALUATED row must not read as unassessed.
    expect(t.text).not.toBe(CS3D_NOT_ASSESSED_LABEL)
  })

  it('not-assessed → the CS3D_NOT_ASSESSED_LABEL constant, qualified', () => {
    const t = cs3dToken(row({ status: 'not-assessed' }))!
    // Asserted against the CONSTANT, not a copy of its text, so the constant stays the single source.
    expect(t.text).toBe(CS3D_NOT_ASSESSED_LABEL)
    expect(t.framework).toBe('CS3D')
    expect(t.qualified).toBe(true)
  })

  it('no row at all → still qualified, never a negative finding', () => {
    const t = cs3dToken(undefined)!
    expect(t.text).toBe(CS3D_NOT_ASSESSED_LABEL)
    expect(t.framework).toBe('CS3D')
    expect(t.qualified).toBe(true)
  })

  it('applies wins over near-threshold — arm order, not a coincidence', () => {
    // A marginal limb ABOVE its figure still applies, so the token is plain and the near-ness is
    // carried by the row (and reaches the finding through citedNear), not by a caveat in the text.
    const t = cs3dToken(row({ applies: true, status: 'near-threshold' }))!
    expect(t.text).toBe('CS3D')
    expect(t.qualified).toBeUndefined()
  })
})
