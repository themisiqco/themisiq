// lib/ghg/entry.ts
//
// WHAT /dashboard/ghg OPENS, decided in one place (free-calc-cta, Oct 2026). Pure: no React, no Supabase, so the
// three questions the page asks on entry can be tested for every kind of visitor.
//
// THE FREE CALCULATOR LINK CARRIES ?start=new (FREE_CALC_HREF in lib/pricingCopy.ts). With it, everyone gets a
// blank Scope 1 and Scope 2 calculator: a signed-in customer with saved inventories is not sent to Trends, and a
// customer whose plan has ended is not stopped at the renew screen. Saving and the paid features stay gated
// exactly as they are, by the same checks and by enforce_ghg_location_allowance() in Postgres. Without the
// parameter every visitor gets what they got before.

import type { EntitlementAccess } from '../useEntitlement'

export const START_NEW_PARAM = 'start'
export const START_NEW_VALUE = 'new'

/** True when the URL asks for a blank calculator. */
export function wantsNewCalculator(params: { get(name: string): string | null }): boolean {
  return params.get(START_NEW_PARAM) === START_NEW_VALUE
}

/**
 * The first view, once the session and the inventory count are known.
 * - 'restore-draft': a stashed draft exists (the visitor went to pricing from the wizard) and is put back.
 * - 'wizard': a blank calculator.
 * - 'list': the inventory list (?view=list).
 * - 'trends': a customer with saved inventories lands on Trends.
 *
 * ⚠️ A DRAFT IS NOT RESTORED UNDER ?start=new, AND IS NOT CLEARED EITHER. The visitor asked for a blank
 * calculator; their stash stays in this browser and comes back on the next ordinary visit, within its lifetime.
 */
export function entryView(input: {
  hasId: boolean
  startNew: boolean
  hasDraft: boolean
  signedIn: boolean
  savedInventoryCount: number
  viewParam: string | null
}): 'wizard' | 'restore-draft' | 'list' | 'trends' {
  if (input.hasId) return 'wizard'
  if (input.startNew) return 'wizard'
  if (input.hasDraft) return 'restore-draft'
  if (!input.signedIn || input.savedInventoryCount === 0) return 'wizard'
  return input.viewParam === 'list' ? 'list' : 'trends'
}

/**
 * Which wall, if any, stands in front of a blank wizard. null = none.
 * 'expired' and 'unknown' wall a blank wizard so a customer with saved inventories, or whose plan could not be
 * read, is not handed a form whose Save may not work. Under ?start=new the visitor has asked for exactly that
 * form, in free mode, so there is no wall; the read-on banner still says what has happened.
 */
export function entryWall(input: {
  mode: 'loading' | 'list' | 'wizard'
  hasInventoryId: boolean
  access: EntitlementAccess
  startNew: boolean
}): null | 'loading' | 'expired' | 'unknown' {
  if (input.mode !== 'wizard' || input.hasInventoryId || input.startNew) return null
  if (input.access === 'active' || input.access === 'none') return null
  return input.access
}

/**
 * Whether Save goes to pricing (stashing the draft) instead of writing. The database refuses the write anyway;
 * this refuses first so nothing is written on the way, in particular the companies row handleSave creates before
 * the inventory, which would be left behind as an orphan.
 * - Signed out, or no GHG plan: as before.
 * - Plan ended, on a NEW inventory (only reachable in free mode, ?start=new): the same, since there is no saved
 *   record to keep and the company row would be orphaned. An expired customer editing a saved inventory keeps
 *   today's behaviour: the trigger refuses and says why.
 */
export function saveGoesToPricing(input: { signedIn: boolean; access: EntitlementAccess; hasInventoryId: boolean }): boolean {
  if (!input.signedIn || input.access === 'none') return true
  return input.access === 'expired' && !input.hasInventoryId
}
