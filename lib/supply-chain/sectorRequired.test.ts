import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEW_SUPPLIER_SECTOR, hasValidSector, suppliersWithoutSector, sectorRequiredMessage, SECTOR_REJECTED_MESSAGE } from './sectorRequired'
import { INDUSTRY_CODES } from '../emissionFactors/industryOptions'

// The database trigger assert_sector_codes_exist() rejects a register (PT422) if any supplier's sector
// is not an EXIOBASE industry code. Until 30 Sep 2026 a new supplier started on 'Professional Services',
// a retired sector NAME, so a supplier left on the default failed every save with a generic message.

describe('a new supplier has no sector until one is chosen', () => {
  it('starts empty, which is not a valid sector', () => {
    expect(NEW_SUPPLIER_SECTOR).toBe('')
    expect(hasValidSector(NEW_SUPPLIER_SECTOR)).toBe(false)
  })

  it('the old default and the other retired names are not valid sectors', () => {
    for (const retired of ['Professional Services', 'Mining & Metals', 'IT & Software', 'Other Manufacturing'])
      expect(hasValidSector(retired), retired).toBe(false)
  })

  it('every EXIOBASE industry code is valid, and nothing else is', () => {
    expect(INDUSTRY_CODES.size).toBe(163)
    for (const code of INDUSTRY_CODES) expect(hasValidSector(code), code).toBe(true)
    for (const bad of [null, undefined, 0, ' ', 'i01.a ', 'I01.A', 'p01.a']) expect(hasValidSector(bad), String(bad)).toBe(false)
  })
})

describe('the save is refused, naming the suppliers', () => {
  const code = [...INDUSTRY_CODES][0]

  it('nothing to fix when every supplier has a code', () => {
    expect(suppliersWithoutSector([{ name: 'Acme', sector: code }, { name: 'Beta', sector: code }])).toEqual([])
    expect(suppliersWithoutSector([])).toEqual([])
  })

  it('names each supplier without a valid sector, by name or by position', () => {
    expect(suppliersWithoutSector([
      { name: 'Acme', sector: code },
      { name: ' Beta Ltd ', sector: '' },
      { name: '', sector: 'Professional Services' },
    ])).toEqual(['Beta Ltd', 'Supplier 3'])
  })

  it('one supplier: a sentence naming it', () => {
    expect(sectorRequiredMessage(['Beta Ltd'])).toBe(
      'Choose a sector for Beta Ltd before saving. A register cannot be saved while a supplier has no sector.')
  })

  it('several: the count and the names, capped at five', () => {
    expect(sectorRequiredMessage(['A', 'B'])).toBe(
      'Choose a sector for these 2 suppliers before saving: A, B. A register cannot be saved while a supplier has no sector.')
    expect(sectorRequiredMessage(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toContain('these 7 suppliers before saving: A, B, C, D, E and 2 more.')
  })

  it('the database refusal has its own sentence, not "try again"', () => {
    expect(SECTOR_REJECTED_MESSAGE).toContain('was not saved')
    expect(SECTOR_REJECTED_MESSAGE).not.toMatch(/try again/i)
  })
})

describe('the supply-chain page is wired to it', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/supply-chain/page.tsx'), 'utf8')

  it('newSupplier() uses the empty default, and no retired name is a default', () => {
    expect(src).toContain('sector: NEW_SUPPLIER_SECTOR,')
    expect(src).not.toMatch(/sector: 'Professional Services',\s*\n\s*annual_spend/)
  })

  it('handleSave refuses before the insert or update, and PT422 is named', () => {
    const check = src.indexOf('const noSector = suppliersWithoutSector(inventory.suppliers)')
    const write = src.indexOf(".from('supply_chain_registers').update(payload)")
    expect(check).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(check)
    expect(src).toContain("error.code === 'PT422' ? SECTOR_REJECTED_MESSAGE")
  })

  it('the sector select shows "Select sector" for anything that is not an option, with the required note', () => {
    expect(src).toContain("value={hasValidSector(inventory.suppliers[activeSupplier].sector) ? inventory.suppliers[activeSupplier].sector : ''}")
    expect(src).toContain('Required. The register cannot be saved until every supplier has a sector.')
  })
})
