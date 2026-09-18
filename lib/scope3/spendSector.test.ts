import { describe, it, expect } from 'vitest'
import { spendSector, SPEND_SECTOR_FIELD } from './spendSector'

describe('the sector a spend-priced category is priced with', () => {
  it('SS1 each category reads its own field, and only its own', () => {
    const data = {
      cat1: { supplier_sector: 'i29', spend_sector: 'i62' },
      cat2: { spend_sector: 'p30', supplier_sector: 'p45' },
      cat4: { spend_sector: 'i60.1' },
    }
    expect(spendSector(data, 'cat1')).toBe('i29')
    expect(spendSector(data, 'cat2')).toBe('p30')
    expect(spendSector(data, 'cat4')).toBe('i60.1')
    expect(SPEND_SECTOR_FIELD).toEqual({ cat1: 'supplier_sector', cat2: 'spend_sector', cat4: 'spend_sector' })
  })

  it('SS2 ⚠️ an unchosen sector is empty, and there is no stand-in of any kind', () => {
    // THE WHOLE POINT OF THIS MODULE. Category 1 used to fall back to the company sector, so an untouched
    // category produced a real figure from a row nobody picked. The company sector is not a parameter here,
    // so no edit to this function can reintroduce it — and no other category's answer can stand in either.
    const data = { cat1: {}, cat2: { spend_sector: 'p30' }, cat4: { spend_sector: 'i62' } }
    expect(spendSector(data, 'cat1')).toBe('')
    expect(spendSector({}, 'cat1')).toBe('')
    expect(spendSector({ cat1: undefined }, 'cat1')).toBe('')
    // An empty string stored is the same as nothing stored: both mean unchosen, neither prices.
    expect(spendSector({ cat1: { supplier_sector: '' } }, 'cat1')).toBe('')
    // ⚠️ The signature is the guarantee: passing a company sector is not possible. If this ever compiles
    // with a third argument, the guarantee is gone.
    expect(spendSector.length).toBe(2)
  })

  it('SS3 a category that is not spend-priced has no spend sector, and does not throw', () => {
    // Callers ask for every one of the fifteen from one list.
    for (const id of ['cat5', 'cat6', 'cat15', 'nonsense', '']) {
      expect(spendSector({ cat5: { spend_sector: 'i90.1.a' } }, id), id).toBe('')
    }
  })

  it('SS4 prototype keys are not fields', () => {
    // Object.hasOwn rather than `in`: 'toString' and 'constructor' are on every object's prototype, and a
    // category id arriving from stored data is not always one we wrote.
    expect(spendSector({}, 'toString')).toBe('')
    expect(spendSector({}, 'constructor')).toBe('')
  })
})
