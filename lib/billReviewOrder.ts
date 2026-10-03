// lib/billReviewOrder.ts
//
// THE BILL REVIEW PART OF AN ORDER, FOR BOTH PURCHASE ROUTES (pricing-2026-10). Pure: the routes read the
// customer's entitlements and pass them in; this decides what may be sold, at what price, and what the webhook
// must be told. /api/checkout and /api/admin/create-invoice both call it, so the two cannot drift apart, and the
// price is billReviewQuote's, the same function /pricing displays from.
//
// Bill Review is the customer-facing name of the add-on formerly called Concierge. Internal names stay:
// entitlements.module_key 'concierge' (CONCIERGE_KEY), the `concierge` request body field and the concierge_*
// metadata keys.

import {
  billReviewQuote, isFirstConciergePurchase, isGhgTier, UTILITY_CONNECT_ENABLED, BILL_REVIEW_HUMAN_READING_SELLABLE,
  CONCIERGE_KEY, type GhgTier, type BillReviewQuote,
} from './pricing'

/** An entitlements row as the routes read it: what the customer already holds. */
export type OwnedRow = { module_key: string; ghg_tier?: string | null; term_end?: string | null }

export type BillReviewRequest = { uploadedSources?: unknown; connectedSources?: unknown; reading?: unknown }

export type BillReviewOrder =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      quote: BillReviewQuote
      isFirstPurchase: boolean
      /** Spread into the Stripe metadata. */
      meta: Record<string, string>
      /** Appended to the order's `source` string. */
      source: string
      grant: typeof CONCIERGE_KEY
    }

/**
 * @param cartTier the GHG tier in this cart, or null when GHG is not being bought now.
 * @param owned every entitlements row the customer holds (RLS-scoped read by the route).
 * @param now the time to judge an owned GHG term against.
 */
export function billReviewOrder(req: BillReviewRequest, cartTier: GhgTier | null, owned: readonly OwnedRow[], now: Date): BillReviewOrder {
  const fail = (status: number, error: string): BillReviewOrder => ({ ok: false, status, error })

  if (typeof req.connectedSources === 'number' && req.connectedSources > 0 && !UTILITY_CONNECT_ENABLED) {
    return fail(400, 'Connected utility sources are not available yet. Please order uploaded sources only.')
  }
  const reading = req.reading ?? 'ai'
  if (reading !== 'ai' && reading !== 'human') return fail(400, 'Unknown Bill Review reading option.')
  if (reading === 'human' && !BILL_REVIEW_HUMAN_READING_SELLABLE) {
    return fail(400, 'Human reading cannot be ordered online yet. Please contact us to arrange it.')
  }

  // Bill Review requires an ACTIVE GHG plan: in this cart, or held with a term that has not ended. The check used
  // to accept any GHG row, so a customer whose GHG term had ended could still buy Bill Review on its own.
  const activeGhg = owned.find(r => r.module_key === 'ghg' && r.term_end != null && new Date(r.term_end).getTime() > now.getTime())
  if (cartTier == null && !activeGhg) {
    return fail(400, 'Bill Review requires an active GHG plan. Add GHG to your order, or renew it first.')
  }

  const isFirstPurchase = isFirstConciergePurchase(owned.map(r => r.module_key))
  // The tier prices onboarding: this cart's, else the plan the customer holds.
  const heldTier = activeGhg && isGhgTier(activeGhg.ghg_tier) ? activeGhg.ghg_tier : null
  const tier: GhgTier | null = cartTier ?? heldTier
  if (isFirstPurchase && tier == null) {
    return fail(400, 'We could not tell which GHG plan you hold, so Bill Review onboarding cannot be priced. Please contact us.')
  }

  let quote: BillReviewQuote
  try {
    quote = billReviewQuote({ tier, reading, sources: req.uploadedSources as number, isFirstPurchase })
  } catch (e) {
    // billReviewQuote's messages are written for a person and name the actual fault.
    return fail(400, (e as Error).message.replace(/^billReviewQuote: /, ''))
  }
  if (quote.requiresQuote) return fail(400, 'Bill Review for the Enterprise plan is quoted. Please contact us.')

  const uploaded = req.uploadedSources as number
  return {
    ok: true,
    quote,
    isFirstPurchase,
    grant: CONCIERGE_KEY,
    meta: {
      concierge_uploaded_sources: String(uploaded),
      concierge_connected_sources: '0',
      concierge_source_allowance: String(quote.sourceAllowance),
      // Recorded, never granted. Onboarding buys setup work and the first year for the included sources; the
      // webhook must not turn this into an entitlement row.
      concierge_onboarding_usd: String(quote.onboardingUSD),
    },
    source: `concierge:${uploaded}u${isFirstPurchase ? '+onboarding' : ''}`,
  }
}
