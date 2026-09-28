import { UTILITY_CONNECT_ENABLED, CONCIERGE_SOURCE_USD } from '../../lib/pricing'
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

/** The target behaviour: what these answers say once utility connection ships. */
export const FAQ_CONNECTED: readonly Faq[] = [
  { q: "What's included in Concierge onboarding?",
    a: 'A ThemisIQ specialist works with you to set up your inventory. We identify every data source across your locations, connect the ones your utilities allow, load your historical bills, and check your baseline with you before your first report. Onboarding is a one-time fee based on your GHG tier.' },
  { q: 'Do I need Concierge to use the GHG module?',
    a: 'No. The GHG module is fully self-serve. Concierge is for teams who would rather not enter bills themselves.' },
  { q: 'How does ThemisIQ get my utility data?',
    a: "Where your utility allows it, we connect to your account and pull usage and billing data directly from the utility, with your permission. Where a direct connection isn't available, you upload your bills and Concierge reads them for you. You approve every figure before it goes into your inventory, and each one stays linked to its source record." },
  { q: 'How do I know if my utility can connect directly?',
    a: 'We check each of your utilities during onboarding and tell you which sources will connect and which will be uploaded.' },
  { q: 'What counts as a data source?',
    a: 'One utility account or meter that bills you on a recurring basis, such as an electricity account or a gas meter. A location with electricity and natural gas is usually two data sources.' },
  { q: 'How is Concierge billed?',
    a: `A one-time onboarding fee, then an annual fee for each data source: $${CONCIERGE_SOURCE_USD.connected} a year for a source connected directly to your utility, $${CONCIERGE_SOURCE_USD.uploaded} a year for a source you upload.` },
  { q: 'If my utility adds direct connection later, does my price change?',
    a: 'Yes. Once a source is connected, it moves to the connected rate at your next renewal.' },
]

/** What renders while UTILITY_CONNECT_ENABLED is false. Uploads now, connections later. */
export const FAQ_UPLOAD_ONLY: readonly Faq[] = [
  { q: "What's included in Concierge onboarding?",
    a: 'A ThemisIQ specialist works with you to set up your inventory. We identify every data source across your locations, load your historical bills, and check your baseline with you before your first report. Onboarding is a one-time fee based on your GHG tier.' },
  { q: 'Do I need Concierge to use the GHG module?',
    a: 'No. The GHG module is fully self-serve. Concierge is for teams who would rather not enter bills themselves.' },
  { q: 'How does ThemisIQ get my utility data?',
    a: 'You upload your bills and Concierge reads them for you. You approve every figure before it goes into your inventory, and each one stays linked to its source record. Direct connections to utilities are coming soon.' },
  { q: 'What counts as a data source?',
    a: 'One utility account or meter that bills you on a recurring basis, such as an electricity account or a gas meter. A location with electricity and natural gas is usually two data sources.' },
  { q: 'How is Concierge billed?',
    a: `A one-time onboarding fee, then $${CONCIERGE_SOURCE_USD.uploaded} a year for each data source you upload. Sources connected directly to your utility will be $${CONCIERGE_SOURCE_USD.connected} a year once direct connections launch.` },
]

/** The set the page renders. One flag decides, in one place. */
export const CONCIERGE_FAQ: readonly Faq[] = UTILITY_CONNECT_ENABLED ? FAQ_CONNECTED : FAQ_UPLOAD_ONLY
