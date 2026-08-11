import { describe, it, expect } from 'vitest'
import {
  makeMapFramework, regimeLabel, cs3dToken, CS3D_NOT_ASSESSED_LABEL,
  CS3D_NEAR_THRESHOLD_LABEL, CS3D_NOT_ASSESSED_HEADING,
  cs3dNoteWizard, cs3dNoteReport, resolveCs3d,
  type RegimeToken, type Cs3dState,
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

// The sentence printed beneath a finding, for both surfaces. These exist because the equivalent
// logic used to be a ternary inside two components, where nothing could reach it: widening
// Cs3dState to four members type-checked cleanly and shipped "CS3D not assessed: ." — right
// heading gone wrong, no sentence, a bare full stop. Every assertion below is about what a
// customer READS, so the failure mode is legible rather than structural.
describe('cs3dNoteWizard / cs3dNoteReport — what actually prints, per state, per surface', () => {
  const S = {
    applies: { state: 'applies' },
    nearWithReason: { state: 'near-threshold', reason: 'below the size route assessed here' },
    nearNoReason: { state: 'near-threshold', reason: null },
    conditional: { state: 'conditional', reason: 'size test incomplete' },
    notApplicable: { state: 'not-applicable' },
  } satisfies Record<string, Cs3dState>

  // Renders the note EXACTLY as each page's JSX does, so the assertions below are the customer's
  // string and not a paraphrase of it. Wizard: heading, colon, body, full stop — body is never null
  // there by return type. Report: the colon and stop belong to the body, so a heading-only note
  // carries neither.
  const wizardString = (s: Cs3dState) => {
    const n = cs3dNoteWizard(s)
    return n && `${n.heading}: ${n.body}.`
  }
  const reportString = (s: Cs3dState) => {
    const n = cs3dNoteReport(s)
    return n && `${n.heading}${n.body ? ':' : ''}${n.body ? ` ${n.body}.` : ''}`
  }

  describe('wizard', () => {
    it('near-threshold prints NOTHING — citedNear carries that row on this screen', () => {
      expect(cs3dNoteWizard(S.nearWithReason)).toBeNull()
      expect(wizardString(S.nearWithReason)).toBeNull()
    })

    it('near-threshold with no reason is equally silent — not a heading, not a stray stop', () => {
      expect(cs3dNoteWizard(S.nearNoReason)).toBeNull()
    })

    it('conditional keeps the wording it has always had', () => {
      expect(wizardString(S.conditional)).toBe('CS3D not assessed: size test incomplete.')
    })

    it('applies and not-applicable print nothing', () => {
      expect(cs3dNoteWizard(S.applies)).toBeNull()
      expect(cs3dNoteWizard(S.notApplicable)).toBeNull()
    })

    it('an empty conditional reason suppresses the line, never a naked heading', () => {
      expect(cs3dNoteWizard({ state: 'conditional', reason: '   ' })).toBeNull()
    })
  })

  describe('report', () => {
    it('near-threshold gets its OWN heading, and it does not say the test was not run', () => {
      expect(reportString(S.nearWithReason))
        .toBe('CS3D (near threshold): below the size route assessed here.')
      // The whole point, pinned twice: not the abstention wording, in heading or in full.
      expect(cs3dNoteReport(S.nearWithReason)!.heading).not.toBe(CS3D_NOT_ASSESSED_HEADING)
      expect(reportString(S.nearWithReason)).not.toContain('not assessed')
    })

    it('the heading IS the token, so the Framework column and the sentence cannot drift', () => {
      const heading = cs3dNoteReport(S.nearWithReason)!.heading
      expect(heading).toBe(CS3D_NEAR_THRESHOLD_LABEL)
      // Asserted against cs3dToken's own output, not against a copy of the string.
      expect(heading).toBe(cs3dToken({ framework: 'CS3D', applies: false, status: 'near-threshold' })!.text)
    })

    it('near-threshold with no reason renders heading only — no colon, no full stop, no gap', () => {
      const s = reportString(S.nearNoReason)!
      expect(s).toBe('CS3D (near threshold)')
      expect(s).not.toContain(':')
      expect(s).not.toContain('.')
      expect(s.trim()).toBe(s)
    })

    it('conditional is unchanged from the wizard — one abstention wording across both surfaces', () => {
      expect(reportString(S.conditional)).toBe('CS3D not assessed: size test incomplete.')
      expect(reportString(S.conditional)).toBe(wizardString(S.conditional))
    })

    it('applies and not-applicable print nothing', () => {
      expect(cs3dNoteReport(S.applies)).toBeNull()
      expect(cs3dNoteReport(S.notApplicable)).toBeNull()
    })
  })

  // Guards the regression directly, at the level a customer meets it. A bare stop is what the
  // fourth Cs3dState member shipped on both pages; no state on either surface may produce one.
  it('NO surface, in ANY state, ever renders a heading with an empty sentence after it', () => {
    for (const [name, state] of Object.entries(S)) {
      for (const [surface, render] of [['wizard', wizardString], ['report', reportString]] as const) {
        const s = render(state)
        if (s === null) continue
        expect(`${surface}/${name}: ${s}`).not.toMatch(/:\s*\.?\s*$/)
        expect(`${surface}/${name}: ${s}`).not.toMatch(/\s\.\s*$/)
      }
    }
  })

  // End to end from the ENGINE, not from a hand-built state: the real EU row that used to print the
  // false sentence. 4,700 employees puts both art. 2(1)(a) limbs inside the band and unmet.
  it('the real near-threshold EU row: silent on the wizard, correctly headed on the report', () => {
    const args = ['European Union', 1_400_000_000, 'Technology', 'ma', 'EUR', { employee_count: 4_700 }] as const
    const rows = getFrameworkApplicability(...args)
    const state = resolveCs3d(getApplicableFrameworks(...args), rows)
    expect(state.state).toBe('near-threshold')
    expect(cs3dNoteWizard(state)).toBeNull()
    const doc = reportString(state)!
    expect(doc.startsWith(CS3D_NEAR_THRESHOLD_LABEL)).toBe(true)
    expect(doc).not.toContain('not assessed')
    // The two sentences the fall-through used to produce about an EU target.
    expect(doc).not.toContain('non-EU')
    expect(doc).not.toContain('markets')
  })
})
