// app/dashboard/cbam/page.tsx — TEMPORARY REDIRECT (29 Jul 2026).
//
// The disclosures form that lived here moved to /dashboard/cbam/disclosures. This path is
// about to become the CBAM readiness hub (Layer 1), so the redirect is deliberately
// temporary and page-level rather than a permanent rule in next.config.ts — it is replaced,
// not removed.
//
// Kept because two marketing CTAs point here (HomePricing.tsx, pricing/page.tsx) and must
// keep working through the move. They are NOT being repointed: /dashboard/cbam is the right
// destination for "Calculate your embedded emissions →" once the hub exists.
//
// TARGET IS SETUP, NOT DISCLOSURES. Those CTAs land a customer who has just bought and has
// no data at all. Disclosures needs an installation to exist and dead-ends without one;
// setup is where an installation gets created. Sending a new buyer to a screen that cannot
// do anything for them is worse than one extra click.
import { redirect } from 'next/navigation'

export default function CbamIndexPage() {
  redirect('/dashboard/cbam/setup')
}
