import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { COUNTRIES, builderCountries, availableCountries, STATUS_LABEL } from './countries'

// Stage D1b: a country that is not available appears on NO public surface, and no "Not yet available" line
// remains. In the builder, a country in preview is visible only to the preview list, decided on the server
// (lib/forcedLabour/countryGate.ts; app/api/forced-labour/forcedLabour.test.ts).

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('statuses', () => {
  it('Canada available, the UK in preview, Australia hidden; only an available country has a page', () => {
    expect(COUNTRIES.map(c => [c.key, c.status, c.href])).toEqual([['canada', 'available', '/forced-labour/canada'], ['australia', 'hidden', null], ['uk', 'preview', null]])
    expect(availableCountries().map(c => c.key)).toEqual(['canada'])
    expect(STATUS_LABEL).toEqual({ available: 'Available' })
  })
  it('the builder shows the UK only to a preview account; Australia to no one', () => {
    expect(builderCountries(false).map(c => c.key)).toEqual(['canada'])
    expect(builderCountries(true).map(c => c.key)).toEqual(['canada', 'uk'])
  })
})

describe('nowhere public', () => {
  it('no UK or Australia page, no sitemap entry', () => {
    expect(existsSync(join(ROOT, 'app/forced-labour/uk'))).toBe(false)
    expect(existsSync(join(ROOT, 'app/forced-labour/australia'))).toBe(false)
    expect(read('app/sitemap.ts')).not.toMatch(/forced-labour\/(uk|australia)/)
  })
  it('no "Not yet available" anywhere in the module’s pages, cards or builder', () => {
    for (const f of ['app/forced-labour/page.tsx', 'app/forced-labour/canada/page.tsx', 'app/dashboard/forced-labour/page.tsx', 'lib/forcedLabour/countries.ts', 'app/dashboard/page.tsx', 'app/components/HomePricing.tsx']) {
      const code = read(f).split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
      expect(code, f).not.toMatch(/not yet available/i)
    }
  })
  it('the module page lists available countries only, and its FAQ names no other', () => {
    const page = read('app/forced-labour/page.tsx')
    expect(page).toContain('{availableCountries().map(c => {')
    expect(page).not.toMatch(/COUNTRIES\.map/)
    expect(page).not.toMatch(/Australia’s Modern Slavery|UK’s Modern Slavery/)
  })
  it('the Start a report list offers only the countries the account may use, none disabled', () => {
    const list = read('app/dashboard/forced-labour/page.tsx')
    expect(list).toContain("flApi<{ countries: { key: CountryKey; name: string; law: string }[] }>('/countries')")
    expect(list).not.toMatch(/disabled=\{c\.status/)
  })
})
