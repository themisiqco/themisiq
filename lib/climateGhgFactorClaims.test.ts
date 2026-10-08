import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// T3c diff 4: app/climate-ghg/page.tsx said "Everywhere else uses US EPA combustion factors". The engine never does
// that: no factor falls back to another country's or publisher's value, and a location in an unsupported country is
// refused, excluded from every total and named on every surface (CLAUDE.md, GHG engine invariants). The page states
// what the product does, and this holds it there.

const PAGE = readFileSync(join(process.cwd(), 'app/climate-ghg/page.tsx'), 'utf8')
// The page as a reader sees it: comments removed, escaped apostrophes read as apostrophes.
const TEXT = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\\'/g, "'")

describe('climate-ghg: no fallback to another country\'s or publisher\'s factors', () => {
  it('never claims a location is priced with another jurisdiction\'s or publisher\'s factors', () => {
    for (const re of [
      /everywhere else uses/i,
      /(other|remaining|unsupported) (countries|jurisdictions|locations) (use|are priced with|fall back)/i,
      /falls? back to (the )?(US|UK|EU|EPA|DEFRA|DESNZ|IPCC|another)/i,
      /\b(US EPA|EPA|DEFRA|DESNZ) (combustion )?factors (are used )?(for|everywhere|elsewhere)/i,
      /default(s)? to (US|EPA|UK|DEFRA)/i,
    ]) expect(TEXT, String(re)).not.toMatch(re)
  })

  it('says what happens instead: not priced, left out of every total, named, never another country\'s factors', () => {
    const a = TEXT.slice(TEXT.indexOf("q: 'What if you do not hold factors for one of our countries?'"))
    const answer = a.slice(0, a.indexOf('},'))
    expect(answer).toContain('Six jurisdictions have their own published factor editions: the US, Canada, the UK, the EU, Australia and New Zealand.')
    expect(answer).toContain('is not priced: it is left out of every total, and it is named wherever the figures appear')
    expect(answer).toContain("We never price it with another country's factors.")
    expect(answer).toContain('flagged for review instead of being estimated')
    expect(answer).toContain('refrigerants are a declared gap')
    expect(answer).not.toContain('\u2014')
  })
})
