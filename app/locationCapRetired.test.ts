// app/locationCapRetired.test.ts
//
// FI0: GHG is priced by company size with unlimited locations. No surface enforces, reads or describes a
// location limit, and no price note renders a missing number ("for up to  locations").

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from '../lib/testing/stripComments'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const walk = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap(n => {
  const rel = `${dir}/${n}`
  if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel)
  return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [rel] : []
})

describe('the location cap is retired (FI0)', () => {
  const files = [...walk('app'), ...walk('lib')]

  it('no code reads, derives or enforces a location allowance', () => {
    for (const rel of files) {
      const code = stripTsComments(read(rel))
      expect(code, rel).not.toMatch(/useGhgLocationAllowance|locationAllowance|location_allowance|showLocationWall/)
    }
  })

  it('no customer-facing text describes a location limit or prices by locations', () => {
    for (const rel of files) {
      const code = stripTsComments(read(rel))
      expect(code, rel).not.toMatch(/location limit|priced by number of locations|Priced by locations|Up to \$\{a\} locations|≤\$\{alw\} locations|for up to \{/i)
    }
  })

  it('the GHG page heading and the price notes say what the price follows', () => {
    expect(read('app/climate-ghg/page.tsx')).toContain('Priced by company size, not by number of sites.')
    const calc = read('app/calculate-emissions/page.tsx')
    expect((calc.match(/The GHG module is priced by company size, with unlimited locations on every plan: \{GHG_PRICED_BANDS\}/g) ?? []).length).toBe(2)
    expect(read('app/pricing/page.tsx')).toContain('{GHG_SIZE_BASIS_NOTE} Every plan covers unlimited locations.')
  })
})
