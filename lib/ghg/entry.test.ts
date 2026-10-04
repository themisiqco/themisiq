import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wantsNewCalculator, entryView, entryWall, saveGoesToPricing } from './entry'
import { FREE_CALC_HREF } from '../pricingCopy'

// What /dashboard/ghg opens, with and without the free calculator's ?start=new (free-calc-cta, Oct 2026).
const params = (q: string) => new URLSearchParams(q)
const base = { hasId: false, hasDraft: false, viewParam: null as string | null }

describe('/dashboard/ghg entry', () => {
  it('EN1: the free calculator link asks for a blank calculator, and the bare URL does not', () => {
    expect(wantsNewCalculator(new URL(FREE_CALC_HREF, 'https://themisiq.co').searchParams)).toBe(true)
    expect(wantsNewCalculator(params(''))).toBe(false)
    expect(wantsNewCalculator(params('start=other'))).toBe(false)
  })

  describe('logged out', () => {
    it('EN2: gets the blank calculator, with or without the parameter, and Save goes to pricing', () => {
      for (const startNew of [true, false]) {
        expect(entryView({ ...base, startNew, signedIn: false, savedInventoryCount: 0 })).toBe('wizard')
        expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'none', startNew })).toBeNull()
      }
      expect(saveGoesToPricing({ signedIn: false, access: 'none', hasInventoryId: false })).toBe(true)
    })
  })

  describe('active plan with saved inventories', () => {
    const who = { signedIn: true, savedInventoryCount: 3 }
    it('EN3: ?start=new opens the blank calculator, not Trends', () => {
      expect(entryView({ ...base, ...who, startNew: true })).toBe('wizard')
      expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'active', startNew: true })).toBeNull()
    })
    it('EN4: without it, unchanged: Trends, or the list for ?view=list', () => {
      expect(entryView({ ...base, ...who, startNew: false })).toBe('trends')
      expect(entryView({ ...base, ...who, startNew: false, viewParam: 'list' })).toBe('list')
    })
    it('EN5: Save writes as it always has', () => {
      expect(saveGoesToPricing({ signedIn: true, access: 'active', hasInventoryId: false })).toBe(false)
    })
  })

  describe('expired plan', () => {
    it('EN6: ?start=new opens the calculator in free mode, with no renew screen', () => {
      expect(entryView({ ...base, startNew: true, signedIn: true, savedInventoryCount: 2 })).toBe('wizard')
      expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'expired', startNew: true })).toBeNull()
    })
    it('EN7: without it, unchanged: the renew screen in front of a blank wizard', () => {
      expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'expired', startNew: false })).toBe('expired')
    })
    it('EN8: saving stays gated: a new inventory goes to pricing before anything is written; a saved one is refused by the trigger as now', () => {
      expect(saveGoesToPricing({ signedIn: true, access: 'expired', hasInventoryId: false })).toBe(true)
      expect(saveGoesToPricing({ signedIn: true, access: 'expired', hasInventoryId: true })).toBe(false)
    })
  })

  it('EN9: other cases are unchanged', () => {
    // A saved inventory by id is never walled; an unreadable plan walls only without ?start=new; the
    // entitlement read in flight shows the loading screen only without it.
    expect(entryWall({ mode: 'wizard', hasInventoryId: true, access: 'expired', startNew: false })).toBeNull()
    expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'unknown', startNew: false })).toBe('unknown')
    expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'unknown', startNew: true })).toBeNull()
    expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'loading', startNew: false })).toBe('loading')
    expect(entryWall({ mode: 'list', hasInventoryId: false, access: 'expired', startNew: false })).toBeNull()
    // A stashed draft comes back on an ordinary visit, and is left alone (not restored) under ?start=new.
    expect(entryView({ ...base, hasDraft: true, startNew: false, signedIn: true, savedInventoryCount: 3 })).toBe('restore-draft')
    expect(entryView({ ...base, hasDraft: true, startNew: true, signedIn: true, savedInventoryCount: 3 })).toBe('wizard')
    expect(entryView({ ...base, hasId: true, startNew: false, signedIn: true, savedInventoryCount: 3 })).toBe('wizard')
  })

  it('EN10: the page decides with these functions', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(src).toContain('if (loadId || wantsNewCalculator(searchParams)) { setMode(\'wizard\'); return }')
    expect(src).toContain('const wall = entryWall({ mode, hasInventoryId: !!inventoryId, access: ghgAccess, startNew: wantsNewCalculator(searchParams) })')
    expect(src).toContain('saveGoesToPricing({ signedIn: true, access: ghgAccess, hasInventoryId: !!inventoryId })')
    expect(src).toContain('const view = entryView(')
  })
})
