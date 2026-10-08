import { describe, it, expect } from 'vitest'
import { ngaScope3, NGA_SCOPE3_EDITIONS, type NgaCited } from './ngaScope3_2025'

// ── FI6 DIFF 1: EVERY TRANSCRIBED NGA 2025 SCOPE 3 VALUE, CHECKED AGAINST ITS CITATION ─────────────
//
// THE EXPECTED VALUES ARE HARD-CODED HERE, NOT READ FROM THE WORKBOOK. The repo's other workbook tests
// (defraEnergy.test.ts) read a copy committed under data/reference/; the NGA workbook is not in the repo
// (it is in ~/themisiq-sources/nga/, which the build machine does not have). Each expected value below
// was read from national-greenhouse-account-factors-2025.pdf and checked against the .xlsx cell named
// beside it on 7 Oct 2026; the two agree for every value transcribed.

const T = ngaScope3('2025')!

// [key, printed in the PDF, page, xlsx cell]
const ELECTRICITY: [string, string, number, string][] = [
  ['NSW_ACT', '0.03', 8, 'C4'], ['VIC', '0.09', 8, 'C5'], ['QLD', '0.09', 8, 'C6'], ['SA', '0.04', 8, 'C7'],
  ['WA_SWIS', '0.06', 8, 'C8'], ['WA_NWIS', '0.09', 8, 'C10'], ['TAS', '0.03', 8, 'C11'],
  ['NT_DKIS', '0.09', 9, 'C12'], ['NATIONAL', '0.07', 9, 'C14'],
]
// [key, metro printed, metro cell, non-metro printed, non-metro cell]
const GAS: [string, string, string, string, string][] = [
  ['NSW_ACT', '13.1', 'B4', '14.0', 'C4'], ['VIC', '4.0', 'B5', '4.0', 'C5'], ['QLD', '8.8', 'B6', '7.9', 'C6'],
  ['SA', '10.7', 'B7', '10.6', 'C7'], ['WA', '4.1', 'B8', '4.0', 'C8'], ['TAS', 'C', 'B9', 'C', 'C9'],
  ['NT', 'C', 'B10', 'C', 'C10'],
]

const all = (): NgaCited[] => [
  ...Object.values(T.electricity), T.electricityResidualMix,
  ...Object.values(T.naturalGas).flatMap(r => [r.metro, r.non_metro]),
]

describe('NGA 2025 Scope 3 (FI6 diff 1)', () => {
  it('Table 1 Scope 3 electricity: every row, as printed, kg CO2-e/kWh', () => {
    for (const [key, printed, page, cell] of ELECTRICITY) {
      const r = T.electricity[key as keyof typeof T.electricity]
      expect(r.value, key).toBe(Number(printed))
      expect(r.printed, key).toBe(printed)
      expect([r.page, r.cell, r.unit], key).toEqual([page, cell, 'kg CO2-e/kWh'])
      expect(r.table, key).toMatch(/^Table 1 /)
      expect(r.column, key).toBe('Scope 3 Emission Factors (kg CO2-e/kWh)')
    }
  })

  it('Table 2 Scope 3 for the national residual mix factor: 0.11 kg CO2-e/kWh, p.9, C4', () => {
    const r = T.electricityResidualMix
    expect([r.value, r.printed, r.page, r.cell, r.row, r.unit]).toEqual([0.11, '0.11', 9, 'C4', 'National', 'kg CO2-e/kWh'])
    expect(r.table).toMatch(/^Table 2 /)
  })

  it('Table 6 Scope 3 natural gas: every row and both columns, as printed, kg CO2-e/GJ', () => {
    for (const [key, m, mCell, n, nCell] of GAS) {
      const r = T.naturalGas[key as keyof typeof T.naturalGas]
      for (const [c, printed, cell, col] of [[r.metro, m, mCell, 'Metro'], [r.non_metro, n, nCell, 'Non-Metro']] as const) {
        expect(c.printed, `${key} ${col}`).toBe(printed)
        expect(c.value, `${key} ${col}`).toBe(printed === 'C' ? null : Number(printed))
        expect([c.page, c.cell, c.unit], `${key} ${col}`).toEqual([19, cell, 'kg CO2-e/GJ'])
        expect(c.column, `${key} ${col}`).toMatch(new RegExp(`, ${col}$`))
        expect(c.table).toMatch(/^Table 6 /)
      }
    }
  })

  it('each state, territory or grid appears exactly once per table, and nothing else does', () => {
    expect(Object.keys(T.electricity).sort()).toEqual(ELECTRICITY.map(e => e[0]).sort())
    expect(Object.keys(T.naturalGas).sort()).toEqual(GAS.map(g => g[0]).sort())
    const rows = Object.values(T.electricity).map(r => r.row)
    expect(new Set(rows).size).toBe(rows.length)
    const gasRows = Object.values(T.naturalGas).map(r => r.metro.row)
    expect(new Set(gasRows).size).toBe(gasRows.length)
    for (const r of Object.values(T.naturalGas)) expect(r.non_metro.row).toBe(r.metro.row)
    const cells = all().map(c => `${c.table.slice(0, 8)} ${c.cell}`)
    expect(new Set(cells).size, 'no two values share a cell').toBe(cells.length)
  })

  it('no value is derived: each is the printed figure, and a confidential cell has no number', () => {
    for (const c of all()) {
      if (c.printed === 'C') expect(c.value, c.row).toBeNull()
      else {
        expect(c.printed, c.row).toMatch(/^\d+\.\d+$/)
        expect(c.value, c.row).toBe(Number(c.printed))
      }
    }
    // Tasmania and the NT are not filled from Victoria and Western Australia (NGA's suggestion is FI6 diff 2's decision).
    expect(T.naturalGas.TAS.metro.value).toBeNull()
    expect(T.naturalGas.NT.non_metro.value).toBeNull()
  })

  it('is keyed by edition: 2023, 2024 and 2026 (T3d) and 2025 held, any other edition is null', () => {
    expect(NGA_SCOPE3_EDITIONS).toEqual(['2023', '2024', '2025', '2026'])
    expect(ngaScope3('2022')).toBeNull()
    expect(ngaScope3('toString')).toBeNull()
  })
})
