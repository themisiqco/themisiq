import { describe, it, expect } from 'vitest'
import { gridRegionName, residualRegionName } from './gridRegionNames'
import { GRID_EF, US_SUBREGIONS, EU_COUNTRIES } from './engine'

// Every grid and residual-mix region the engine can price with has a name in words (LEAD1 L5 amendment): the results
// email never prints an engine code. A region added to the engine without a name fails here.
describe('grid region names', () => {
  it('G1: every GRID_EF key has a name, and no name is a code', () => {
    for (const code of Object.keys(GRID_EF)) {
      const name = gridRegionName(code)
      expect(name, code).toBeTruthy()
      expect(name).not.toMatch(/^[A-Z_]+$/)
      expect(name).not.toContain('_')
    }
  })

  it('G2: the names the email will print for the common cases', () => {
    expect(gridRegionName('US_AVG')).toBe('United States national average')
    expect(gridRegionName('US_CA')).toBe('California')
    expect(gridRegionName('ON')).toBe('Ontario')
    expect(gridRegionName('NZ')).toBe('New Zealand')
    expect(gridRegionName('UK')).toBe('United Kingdom')
    expect(gridRegionName('EU_DE')).toBe('Germany')
    expect(gridRegionName('EU_AVG')).toBe('EU-27 average')
    expect(gridRegionName('AU_NSW')).toBe('New South Wales')
    expect(gridRegionName('NOPE')).toBeNull()
  })

  it('G3: every residual-mix region has a name: the wizard’s eGRID subregion names, EU member states, Australia', () => {
    for (const [code] of US_SUBREGIONS) {
      const n = residualRegionName(code)
      expect(n, code).toBeTruthy()
      expect(n).not.toBe(code) // eGRID names keep their acronyms (FRCC All); the bare code must not appear
      expect(n).not.toContain('—')
    }
    expect(residualRegionName('CAMX')).toBe('WECC California')
    for (const c of EU_COUNTRIES) expect(residualRegionName(`EU_${c}`), c).toBeTruthy()
    expect(residualRegionName('AU')).toBe('Australia')
  })
})
