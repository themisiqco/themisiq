import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRAMEWORKS, EF_SOURCES } from './engine'

// ⚠️ THE GHG PAGE, ITS CSV AND THE ASSURANCE PDF READ AR6 TOTALS DIRECTLY, AND LABEL THEM WITH EACH
// FRAMEWORK'S gwp. Until 17 Sep 2026 they computed AR4, AR5 and AR6 totals and chose by FRAMEWORKS[].gwp,
// a branch unreachable since every framework became AR6 on 20 Jun 2026 (f83326a). Removing it is only
// safe while that stays true: a framework moved to AR5 would show "GWP: AR5" beside AR6 figures. This test
// is what makes that change fail here first. Restoring per-basis totals is the fix, not editing the test.

const ROOT = join(__dirname, '../..')

describe('GWP basis', () => {
  it('G1 every framework is AR6, which is what the page, CSV and PDF now assume', () => {
    expect(FRAMEWORKS.map(f => [f.id, f.gwp])).toEqual(FRAMEWORKS.map(f => [f.id, 'AR6']))
  })

  it('G2 no AR4 or AR5 totals are computed or passed on', () => {
    // Code only: the comments left where these were removed name them, on purpose.
    const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
    const page = code('app/dashboard/ghg/page.tsx')
    const pdf = code('lib/assurancePdf.ts')
    expect(page).not.toMatch(/calcInventory\([^)]*'AR[45]'/)
    expect(page).not.toMatch(/totalsByGwp|totals_ar[45]\b/)
    expect(pdf).not.toMatch(/totalsAR[45]\b|GWP values \(AR[45]\)/)
  })

  it('G3 ⚠️ nothing calls a GWP basis selectable, optional or an alternative', () => {
    // No inventory has ever been able to choose a basis. The claim sat in EF_SOURCES (printed in the
    // assurance PDF) and in the GHG assistant's prompt, where a model will elaborate on it.
    const texts: [string, string][] = [
      ['EF_SOURCES.gwp_ar4', EF_SOURCES.gwp_ar4],
      ['EF_SOURCES.gwp_ar5', EF_SOURCES.gwp_ar5],
      ['EF_SOURCES.gwp_ar6', EF_SOURCES.gwp_ar6],
    ]
    for (const [where, t] of texts) expect(t, where).not.toMatch(/selectable|alternate|alternative|optional|available|by default/i)
    // The prompt DOES use "alternative" and "available", inside the rule that forbids them, so it is
    // checked for the affirmative forms instead.
    const bot = readFileSync(join(ROOT, 'app/api/ghg-bot/route.ts'), 'utf8')
    expect(bot).not.toMatch(/selectable alternate|remain available|available for manual selection|by default across all frameworks/i)
    expect(bot).toMatch(/never tell a user they can choose, select, switch, toggle or request a GWP basis/)
  })
})
