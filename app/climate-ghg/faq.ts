import { UTILITY_CONNECT_ENABLED, BILL_REVIEW_ONBOARDING_USD, BILL_REVIEW_INCLUDED_SOURCES, BILL_REVIEW_SOURCE_USD, GHG_TIER_LABELS, GHG_TIER_KEYS } from '../../lib/pricing'
import { BILL_REVIEW_DESCRIPTION, BILL_REVIEW_HUMAN_DESCRIPTION } from '../../lib/pricingCopy'
import type { Faq } from '../components/modulePage'

/**
 * The Concierge questions, in two versions, gated on whether utility connection exists.
 *
 * ⚠️ THE LIVE PAGE MUST NOT DESCRIBE A CONNECTION CHECKOUT CANNOT SELL. FAQ_CONNECTED is written
 * as though direct connection is live, because it is the product spec for that build and the page
 * should be able to tell the truth the day the flag moves. It is NOT what renders today.
 * FAQ_UPLOAD_ONLY is, and it says uploads in the present tense and connections in the future.
 * app/climate-ghg/faq.test.ts pins that separation: the flag decides which array is exported, and
 * the interim one may not carry a single present-tense connection claim.
 *
 * ⚠️ NO BRACKETED PLACEHOLDERS IN EITHER ARRAY. ModuleFaq renders `extra` on the live page, so a
 * note to ourselves in there is a note to the customer. Two questions are held out below for
 * exactly that reason, with their text kept so they are not lost.
 *
 * ⚠️ PRICES COME FROM CONCIERGE_SOURCE_USD, NEVER FROM A LITERAL. These answers state the amount a
 * customer is charged, so they are bound to the same constant /api/checkout prices from. A number
 * typed here would be a second source of truth for a price, which is the drift lib/pricing.ts exists
 * to prevent.
 *
 * HELD OUT, to be added once each is answerable:
 *
 *   Q: What do I need to do to connect a utility?
 *   A: You authorize access through a secure sign-in with your utility. You can revoke that access
 *      at any time.
 *   Held because the revocation wording depends on which data provider is chosen, and a promise
 *   about revoking access is not one to publish before the mechanism is known.
 *
 *   Q: How long does onboarding take?
 *   Held because it has not been measured. A guess here becomes an expectation.
 */

// Bill Review (formerly Concierge) prices, worded once from lib/pricing.ts (pricing-2026-10).
const usd = (n: number | null) => `$${(n as number).toLocaleString('en-US')}`
// The plans with a self-serve Bill Review price, in band order (Enterprise is quoted).
const PLANS = GHG_TIER_KEYS.filter(t => BILL_REVIEW_ONBOARDING_USD.ai[t] != null)
const planList = (f: (t: typeof PLANS[number]) => string) =>
  `${PLANS.slice(0, -1).map(f).join(', ')} and ${f(PLANS[PLANS.length - 1])}`
const INCLUDED = `${PLANS.map(t => BILL_REVIEW_INCLUDED_SOURCES[t]).slice(0, -1).join(', ')} or ${BILL_REVIEW_INCLUDED_SOURCES[PLANS[PLANS.length - 1]]} data sources on the ${planList(t => GHG_TIER_LABELS[t])} plans`
const BILLING =
  `A one-time onboarding fee for your GHG plan: ${planList(t => `${usd(BILL_REVIEW_ONBOARDING_USD.ai[t])} ${GHG_TIER_LABELS[t]}`)} ` +
  `(with human reading, ${planList(t => usd(BILL_REVIEW_ONBOARDING_USD.human[t]))}). Onboarding includes the first year for ${INCLUDED}. ` +
  `Each extra data source in the first year, and every active source at renewal, is $${BILL_REVIEW_SOURCE_USD} a year. The ${GHG_TIER_LABELS.enterprise} plan is quoted.`

/** The target behaviour: what these answers say once utility connection ships. */
export const FAQ_CONNECTED: readonly Faq[] = [
  { q: 'What does Bill Review include?', a: `${BILL_REVIEW_DESCRIPTION} ${BILL_REVIEW_HUMAN_DESCRIPTION}` },
  { q: "What's included in Bill Review onboarding?",
    a: `A ThemisIQ specialist works with you to set up your inventory. We identify every data source across your locations, connect the ones your utilities allow, load your historical bills, and check your baseline with you before your first report. Onboarding is a one-time fee based on your GHG plan, and it includes the first year for ${INCLUDED}.` },
  { q: 'Do I need Bill Review to use the GHG module?',
    a: 'No. The GHG module is fully self-serve. Bill Review is for teams who would rather not enter bills themselves.' },
  { q: 'How does ThemisIQ get my utility data?',
    a: "Where your utility allows it, we connect to your account and pull usage and billing data directly from the utility, with your permission. Where a direct connection isn't available, you upload your bills and Bill Review reads them for you. You approve every figure before it goes into your inventory, and each one stays linked to its source record." },
  { q: 'How do I know if my utility can connect directly?',
    a: 'We check each of your utilities during onboarding and tell you which sources will connect and which will be uploaded.' },
  { q: 'What counts as a data source?',
    a: 'One utility account or meter that bills you on a recurring basis, such as an electricity account or a gas meter. A location with electricity and natural gas is usually two data sources.' },
  { q: 'How is Bill Review billed?', a: BILLING },
]

/** What renders while UTILITY_CONNECT_ENABLED is false. Uploads now, connections later. */
export const FAQ_UPLOAD_ONLY: readonly Faq[] = [
  { q: 'What does Bill Review include?', a: `${BILL_REVIEW_DESCRIPTION} ${BILL_REVIEW_HUMAN_DESCRIPTION}` },
  { q: "What's included in Bill Review onboarding?",
    a: `A ThemisIQ specialist works with you to set up your inventory. We identify every data source across your locations, load your historical bills, and check your baseline with you before your first report. Onboarding is a one-time fee based on your GHG plan, and it includes the first year for ${INCLUDED}.` },
  { q: 'Do I need Bill Review to use the GHG module?',
    a: 'No. The GHG module is fully self-serve. Bill Review is for teams who would rather not enter bills themselves.' },
  { q: 'How does ThemisIQ get my utility data?',
    a: 'You upload your bills and Bill Review reads them for you. You approve every figure before it goes into your inventory, and each one stays linked to its source record. Direct connections to utilities are coming soon.' },
  { q: 'What counts as a data source?',
    a: 'One utility account or meter that bills you on a recurring basis, such as an electricity account or a gas meter. A location with electricity and natural gas is usually two data sources.' },
  { q: 'How is Bill Review billed?', a: BILLING },
]

/** The set the page renders. One flag decides, in one place. */
export const CONCIERGE_FAQ: readonly Faq[] = UTILITY_CONNECT_ENABLED ? FAQ_CONNECTED : FAQ_UPLOAD_ONLY

/**
 * T10c: the help entry the bill review links to from beside a disabled Confirm ("Why can't I confirm this
 * bill?"). The anchor is shared with the link (app/dashboard/ghg/page.tsx) so the two cannot drift apart.
 */
export const CONFIRM_HELP_ID = 'why-cant-i-confirm-this-bill'
export const BILL_REVIEW_FAQ: readonly Faq[] = [
  { id: CONFIRM_HELP_ID, q: "Why can't I confirm this bill?",
    a: "Before a bill counts towards your emissions, we need two things from it: the amount you used, and the unit it's measured in. Sometimes we can't get both. The bill might use a unit we don't recognise, the figure might be unclear or hard to read, or the bill might show a charge but no usage. When that happens, we hold the bill back rather than guess, because a wrong number in your report is worse than a missing one. To fix it, open the bill and check what's printed. If the unit is wrong, choose the right one and we'll convert it. If the figure is missing, type it in from the bill. If the bill shouldn't be part of this inventory, reject it. Your report can't be exported while a bill is waiting, so nothing incomplete goes to your customer, lender or verifier." },
]
