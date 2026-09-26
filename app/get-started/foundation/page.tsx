/**
 * LEGACY LINK TARGET. Decided 25 Sep 2026, in the homepage rebuild.
 *
 * ⚠️ NOTHING LINKS HERE FROM THE SITE ANY MORE, AND THAT IS THE DECISION RATHER THAN AN OVERSIGHT.
 * The homepage's four use-case pack cards were this route's only entry point. They were removed
 * because /assess answers "where do I start" better than four cards do: it asks about the visitor's
 * situation instead of making them pick from four guesses about it. This route is kept so that every
 * /get-started/foundation link already in an email, a deck or a search index still lands on the right
 * preselected configurator.
 *
 * So: do NOT add a link to this page, and do NOT delete it. If a multi-module starting point is wanted
 * on the site again, that is a decision about /assess, not about restoring these four routes. The
 * module set lives in lib/packEntryPoints.ts, which carries the same note.
 */
import { redirect } from 'next/navigation'
import { NEW_PRICING_ACTIVE } from '../../../lib/pricing'
import { PACK_SLUG_MODULES } from '../../../lib/packEntryPoints'

export const metadata = {
  title: 'ESG Foundation Pack — ThemisIQ',
  description: 'Your board wants ESG in place. Build your GHG inventory, complete your workforce profile, assess climate risk, and export a board-ready ESG report.',
}

export default function Page() {
  if (NEW_PRICING_ACTIVE) redirect(`/pricing?modules=${PACK_SLUG_MODULES.foundation}`)
}
