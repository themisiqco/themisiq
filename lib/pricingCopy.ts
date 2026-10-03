// Shared pricing copy.
//
// These two sentences are the pitch that sits above the pricing tables. They
// are held here rather than as literals because they drifted: /signup carried
// an older driver wording ("Whether your driver is a regulator, a board, an
// investor or a customer...") for as long as the other surfaces carried theirs,
// and nothing failed.
//
// ⚠️ THEY DO NOT APPEAR ON THE SAME SET OF SURFACES, AND THAT IS DELIBERATE.
// The driver sentence is on /pricing, the homepage pricing section and /signup.
// PRICING_PUBLISHED_SENTENCE is on the first two ONLY: /signup is not a pricing
// surface, and reassurance about knowing the cost before you start has no job on
// a page whose form is free to submit. lib/pricingCopy.test.ts asserts that
// split in both directions, so /signup acquiring it fails rather than passing
// unnoticed.
//
// Edit the wording HERE; the pages read it.
//
// Not in lib/pricing.ts on purpose: that file is the price authority
// (cartQuote, GHG_TIERS, FLAT_MODULE_PRICES) and is imported by the checkout
// and admin-invoice routes. Marketing prose does not belong in the module that
// decides what a customer is charged.

/** Why a visitor is here, and what they pay for. */
export const PRICING_DRIVER_SENTENCE =
  'Whether the request comes from a regulator, a lender, your board or a customer, you pay only for the modules it calls for.'

/** Published prices, against platform and consultancy quotes. */
export const PRICING_PUBLISHED_SENTENCE =
  'Reporting rules keep multiplying, and so do the quotes from platforms and consultancies. Our prices are published, so you know the cost before you start.'

/**
 * Bill Review (the add-on formerly called Concierge), described verbatim wherever a description is shown
 * (pricing-2026-10). One constant per sentence group, so every surface prints the same words.
 */
export const BILL_REVIEW_DESCRIPTION =
  'Upload your bills and we read the figures for you. You check and approve each one, and our specialists spot-check the readings. Includes Verification Readiness: an organized evidence pack and source-document index, ready to hand to your verifier.'

/** The human-read option, verbatim. */
export const BILL_REVIEW_HUMAN_DESCRIPTION =
  'Prefer a person to read your bills? Choose human reading and a ThemisIQ specialist reads each one within 2 business days. Your bills are never sent to AI.'
