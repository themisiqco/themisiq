import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { UK_SECTIONS, UK_KEY_TERMS, UK_SOURCE_LABEL } from './builderContent'
import { UK_OUTCOME_LABEL, UK_ORG_FORMS, ESTIMATE_CAVEAT, evaluateUkApplicability } from './applicability'
import * as CANADA from '../../s211/builderContent'

// Everything UK-specific uses British spelling; Canada's copy is unchanged. Quotations are verbatim and are not
// checked here: the UK constants are British by source, and lib/forcedLabour/uk/requirements.test.ts pins them.

/** Canadian or American forms that British English spells differently. */
const NOT_BRITISH = /\b(organiz\w*|recogniz\w*|realiz\w*|prioritiz\w*|minimiz\w*|maximiz\w*|analyz\w*|behavior\w*|program|programs|center|centers|color\w*|catalog|fulfill)\b/i

function ukCopy(): string[] {
  const out: string[] = []
  for (const s of UK_SECTIONS) {
    out.push(s.title, s.mapsTo, s.plainTerms, s.readersLookFor)
    for (const f of s.fields) {
      out.push(f.label, f.hint, ...(f.sharedNote ? [f.sharedNote] : []), ...(f.columns ?? []).map(c => c.label))
      // What the user sees for each option: its label, or the value where it has none.
      for (const o of f.options ?? []) out.push(f.optionLabels?.[o] ?? o)
    }
  }
  for (const t of UK_KEY_TERMS) out.push(t.term, t.explanation)
  out.push(...Object.values(UK_SOURCE_LABEL), ...Object.values(UK_OUTCOME_LABEL), ...UK_ORG_FORMS.map(o => o.label), ESTIMATE_CAVEAT)
  for (const f of [{ org_form: 'other' }, { uk_business: 'no' }, { supplies: 'no' }, {}, { org_form: 'partnership', uk_business: 'yes', supplies: 'yes', turnover_gbp: '40000000' }])
    out.push(...evaluateUkApplicability(f).reasons, ...evaluateUkApplicability(f).unanswered)
  return out
}

/** The text a component draws itself (JSX text and string literals), not what it imports. */
function componentText(path: string): string[] {
  const src = readFileSync(join(process.cwd(), path), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|import)/.test(l)).join('\n')
  // Property paths (sources.organization) are code, not copy.
  // CSS values (var(--color-ink), 1px solid) are style, not copy.
  return [...src.matchAll(/>([^<>{}]+)</g), ...src.matchAll(/'([^'\n]{12,})'/g)].map(m => m[1].replace(/\b\w+\.\w+/g, '').replace(/var\(--[\w-]+\)/g, '').replace(/\bcolor\s*:/g, ''))
}

describe('UK-specific copy is British', () => {
  it('the UK builder content and the UK check', () => {
    const bad = ukCopy().filter(s => NOT_BRITISH.test(s))
    expect(bad).toEqual([])
    expect(ukCopy().some(s => /organisation/.test(s))).toBe(true)
  })
  it('the UK screens’ own words', () => {
    for (const f of ['app/dashboard/forced-labour/_components/UkApplicability.tsx', 'app/dashboard/forced-labour/_components/CountrySectionPage.tsx', 'app/dashboard/forced-labour/[id]/[country]/page.tsx', 'app/dashboard/forced-labour/_components/EntitiesPanel.tsx', 'app/dashboard/forced-labour/[id]/[country]/check/page.tsx', 'lib/forcedLabour/uk/exportCheck.ts', 'lib/forcedLabour/uk/statementModel.ts']) {
      expect(componentText(f).filter(s => NOT_BRITISH.test(s)), f).toEqual([])
    }
  })
})

describe('Canada copy is unchanged', () => {
  // The fingerprint of lib/s211/builderContent.ts's exports as vitest loads them, taken on 1 Oct 2026 while that
  // file and lib/s211/requirements.ts were byte-identical to the last commit (git diff empty). Any change to a
  // Canada label, hint, option, quotation or example changes it.
  it('every Canada builder string and list, as of 1 Oct 2026', () => {
    const strip = (v: unknown): unknown => typeof v === 'function' ? undefined : Array.isArray(v) ? v.map(strip)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v
    const all = Object.fromEntries(Object.entries(CANADA).filter(([, v]) => typeof v !== 'function').map(([k, v]) => [k, strip(v)]))
    expect(createHash('sha256').update(JSON.stringify(all)).digest('hex')).toBe('ebf9df850c8e97693bf3ab515fd31d28f12577c7d5b06ff74cf455878444ccb7')
  })
  it('and Canada keeps Canadian spelling', () => {
    expect(JSON.stringify(CANADA.SECTIONS)).toMatch(/organization/)
  })
})
