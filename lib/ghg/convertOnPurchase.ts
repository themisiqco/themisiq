// lib/ghg/convertOnPurchase.ts
//
// THE FREE CALCULATION BECOMES THE FIRST INVENTORY ON PURCHASE (LEAD1 L8, Oct 2026; design section 9, Q-L3). Nothing
// is copied: the same ghg_inventories row keeps its id, figures, sites and workings, and only free_tier goes from true
// to false. The Stripe webhook calls convertFreeInventoryOnPurchase after it has written the GHG entitlement; the
// checkout route calls checkoutSuccessPath so the buyer lands on that row.
//
// THE DATABASE ALLOWS IT, AND ONLY IN THIS ORDER. enforce_ghg_location_allowance() (L1-M2) lets ANY write through once
// the user has an active ghg entitlement, and refuses a free-to-paid flip without one. The webhook writes the
// entitlement first, so by the time this runs the gate passes. The service role holds UPDATE on free_tier and on no
// other column of ghg_inventories (L1-M1), which is exactly what this needs, so no SQL change is required.
//
// ⚠️ IT NEVER THROWS. A conversion that fails is logged and reported; the webhook still answers 200, because the
// entitlement (what was paid for) is already written, and a 500 would make Stripe redeliver the whole event for a
// step the customer can be helped with by hand. The row stays free and is still theirs: nothing is lost.

export type ConvertDeps = {
  /** The buying user's free inventory, oldest first: the one the partial unique index allows. */
  findFreeInventory(userId: string): Promise<{ id: string } | null | { error: string }>
  /** Sets free_tier = false on that id, only while it belongs to this user and is still free. Rows changed. */
  markPaid(id: string, userId: string): Promise<{ updated: number } | { error: string }>
}

export type ConvertResult =
  | { status: 'not_ghg' }
  | { status: 'none' }
  | { status: 'converted'; id: string }
  | { status: 'already'; id: string }
  | { status: 'failed'; reason: string }

export async function convertFreeInventoryOnPurchase(userId: string, keys: readonly string[], deps: ConvertDeps): Promise<ConvertResult> {
  if (!keys.includes('ghg')) return { status: 'not_ghg' }
  try {
    const found = await deps.findFreeInventory(userId)
    if (found && 'error' in found) {
      console.error('[webhook] free inventory lookup failed; it stays free:', found.error)
      return { status: 'failed', reason: found.error }
    }
    // No free calculation: the normal case for someone who buys without calculating first. A second delivery after
    // a successful conversion also lands here, because the row is no longer free.
    if (!found) return { status: 'none' }
    const r = await deps.markPaid(found.id, userId)
    if ('error' in r) {
      console.error(`[webhook] could not convert free inventory ${found.id} for user ${userId}; it stays free:`, r.error)
      return { status: 'failed', reason: r.error }
    }
    // 0 rows: someone else (a concurrent delivery) converted it between the read and the write. Same outcome.
    if (r.updated === 0) return { status: 'already', id: found.id }
    console.log(`[webhook] converted free inventory ${found.id} to a paid inventory for user ${userId}`)
    return { status: 'converted', id: found.id }
  } catch (err) {
    console.error('[webhook] free inventory conversion failed; it stays free:', err)
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Where Stripe sends the buyer back to. With GHG in the cart and a free calculation on the account: that inventory,
 * by id (the id does not change when it converts, so the link is right whether or not the webhook has run yet).
 * Otherwise exactly as before L8: /dashboard. {CHECKOUT_SESSION_ID} is Stripe's placeholder and is left as written.
 */
export function checkoutSuccessPath(input: { ghgInCart: boolean; freeInventoryId: string | null }): string {
  if (input.ghgInCart && input.freeInventoryId) {
    return `/dashboard/ghg?id=${encodeURIComponent(input.freeInventoryId)}&purchase=success&session_id={CHECKOUT_SESSION_ID}`
  }
  return '/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}'
}

export const PURCHASE_COPY = {
  converted: 'Your GHG plan is active. This calculation is now your first inventory, with every figure and site kept.',
  pending: 'Your payment has gone through. Your plan is being applied to this calculation: reload the page in a moment if it still shows as your free calculation.',
} as const

/** The line /dashboard/ghg shows on the purchase landing (?purchase=success with an inventory open), or null. */
export function purchaseLine(param: string | null, stillFree: boolean): string | null {
  if (param !== 'success') return null
  return stillFree ? PURCHASE_COPY.pending : PURCHASE_COPY.converted
}
