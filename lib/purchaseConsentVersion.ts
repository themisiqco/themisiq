// lib/purchaseConsentVersion.ts
//
// THE CHECKOUT CONSENT VERSION: which Terms, Refund Policy and checkout consent wording (Consent Part C) a purchase
// agreed to. It travels in the Stripe metadata and is recorded in purchase_consents.consent_version by the webhook.
// One constant for both sides: the consent form (app/components/ConsentForm.tsx) sends it, and the checkout route
// (app/api/checkout/route.ts) falls back to it.
//
// ⚠️ EACH VALUE NAMES EXACT TEXT, RECORDED IN docs/policy-snapshots/ (README.md maps every value to its files). A change
// to the Terms, the Refund Policy or the consent wording is a new value here, in the same commit as its record.
//
//   2026-06-v2-final   Terms effective June 22, 2026; Refund Policy; Consent Part C   (2026-06-v2-final.md)
//   2026-10-v3         Terms effective October 6, 2026 (LEAD1 L10: new Section 3, Free accounts; later sections
//                      renumbered); Refund Policy and Consent Part C unchanged from 2026-06-v2-final
//                      (2026-10-terms.md, and 2026-06-v2-final.md for the unchanged parts)
//
// "-final" marked counsel sign-off on 2026-06-v2-final. 2026-10-v3 carries no "-final" because its Terms section is
// with the lawyer as of 6 Oct 2026; renaming it later would split purchases across two names for the same text.

export const PURCHASE_CONSENT_VERSION = '2026-10-v3'

/** Every consent version a purchase may have recorded, oldest first. Append only. */
export const PURCHASE_CONSENT_VERSIONS = ['2026-06-v2-final', '2026-10-v3'] as const
