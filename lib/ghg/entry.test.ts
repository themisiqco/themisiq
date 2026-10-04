import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wantsNewCalculator, entryView, entryWall } from './entry'
import { decideSave, keepPromptShown, unsavedNudgeArm, type VisitorState } from './keepResults'
import { FREE_CALC_HREF } from '../pricingCopy'

// What /dashboard/ghg opens, with and without the free calculator's ?start=new (free-calc-cta, Oct 2026).
const params = (q: string) => new URLSearchParams(q)
const base = { hasId: false, hasDraft: false, viewParam: null as string | null }
// The wizard's visitor, for Save routing and the "Keep my results" placements (LEAD1 L4).
const visitor = (v: Partial<VisitorState>): VisitorState =>
  ({ signedIn: true, access: 'none', hasInventoryId: false, editingFree: false, hasFreeCalc: false, ...v })

describe('/dashboard/ghg entry', () => {
  it('EN1: the free calculator link asks for a blank calculator, and the bare URL does not', () => {
    expect(wantsNewCalculator(new URL(FREE_CALC_HREF, 'https://themisiq.co').searchParams)).toBe(true)
    expect(wantsNewCalculator(params(''))).toBe(false)
    expect(wantsNewCalculator(params('start=other'))).toBe(false)
  })

  describe('logged out', () => {
    it('EN2: gets the blank calculator, with or without the parameter, and Save opens the Keep my results form', () => {
      for (const startNew of [true, false]) {
        expect(entryView({ ...base, startNew, signedIn: false, savedInventoryCount: 0 })).toBe('wizard')
        expect(entryWall({ mode: 'wizard', hasInventoryId: false, access: 'none', startNew })).toBeNull()
      }
      expect(decideSave(visitor({ signedIn: false }))).toBe('keep_form')
      expect(keepPromptShown(visitor({ signedIn: false }))).toBe(true)
      expect(unsavedNudgeArm(visitor({ signedIn: false }))).toBe('keep')
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
      for (const hasInventoryId of [false, true]) {
        expect(decideSave(visitor({ access: 'active', hasInventoryId }))).toBe('save')
        // L4: no "Keep my results" anywhere for an active plan.
        expect(keepPromptShown(visitor({ access: 'active', hasInventoryId }))).toBe(false)
        expect(unsavedNudgeArm(visitor({ access: 'active', hasInventoryId }))).toBe('save')
      }
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
    it('EN8: a new calculation is kept as the free one (or the one-free choice); a saved real inventory is refused by the trigger as now', () => {
      expect(decideSave(visitor({ access: 'expired' }))).toBe('claim_free')
      expect(decideSave(visitor({ access: 'expired', hasFreeCalc: true }))).toBe('one_free_choice')
      expect(decideSave(visitor({ access: 'expired', hasInventoryId: true }))).toBe('save')
      expect(keepPromptShown(visitor({ access: 'expired' }))).toBe(true)
      expect(keepPromptShown(visitor({ access: 'expired', hasInventoryId: true }))).toBe(false)
    })
  })

  describe('signed in, no plan (LEAD1 L4)', () => {
    it('EN11: no free calculation yet: Save keeps this one as the free calculation, and the prompt shows', () => {
      expect(decideSave(visitor({}))).toBe('claim_free')
      expect(keepPromptShown(visitor({}))).toBe(true)
      expect(unsavedNudgeArm(visitor({}))).toBe('save')
    })
    it('EN12: free calculation already saved, on a new one: the one-free choice, no prompt, the one-free banner', () => {
      expect(decideSave(visitor({ hasFreeCalc: true }))).toBe('one_free_choice')
      expect(keepPromptShown(visitor({ hasFreeCalc: true }))).toBe(false)
      expect(unsavedNudgeArm(visitor({ hasFreeCalc: true }))).toBe('one_free')
    })
    it('EN13: working in its own free calculation: Save just saves, and no prompt shows', () => {
      for (const access of ['none', 'expired'] as const) {
        const v = visitor({ access, hasInventoryId: true, editingFree: true, hasFreeCalc: true })
        expect(decideSave(v)).toBe('save')
        expect(keepPromptShown(v)).toBe(false)
        expect(unsavedNudgeArm(v)).toBe('save')
      }
    })
    it('EN14: while the plan is being read, or cannot be, Save writes and the trigger decides; no prompt', () => {
      for (const access of ['loading', 'unknown'] as const) {
        expect(decideSave(visitor({ access }))).toBe('save')
        expect(keepPromptShown(visitor({ access }))).toBe(false)
        expect(unsavedNudgeArm(visitor({ access }))).toBe('save')
      }
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
    expect(src).toContain('const outcome = decideSave({ signedIn: !!session, access: ghgAccess, hasInventoryId: !!inventoryId, editingFree, hasFreeCalc })')
    expect(src).toContain("if (!session || outcome !== 'save') {")
    expect(src).not.toContain('saveGoesToPricing(')
    expect(src).toContain('const view = entryView(')
  })
})
