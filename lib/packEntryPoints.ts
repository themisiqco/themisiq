// Single source of truth for the use-case "pack" → configurator module sets.
// Values are LEGACY pricing-page module ids (must match VALID_MODULE_IDS in
// app/pricing/page.tsx: ghg | risk | supply | people | deals | ai | cyber).
//
// ⚠️ ITS ONLY REMAINING CONSUMERS ARE FOUR LEGACY LINK TARGETS. The homepage's use-case pack cards
// were this file's other consumer and were removed on 25 Sep 2026 in the homepage rebuild. The four
// flag-gated /get-started/* routes still redirect through it, one per key, so every existing
// /get-started/supplier link in an email, a deck or a search index still lands on the right
// preselected configurator.
//
// ⚠️ THE CARDS ARE NOT COMING BACK, AND THIS FILE IS NOT DEAD. Decided 25 Sep 2026: /assess answers
// "where do I start" better than four cards do, by asking about the visitor's situation instead of
// making them pick from four guesses about it. So nothing on the site links to those four routes by
// design. Do not "clean up" this file as unreferenced — grep finds its consumers under
// app/get-started/, each of which carries the same note — and do not add a homepage link back to
// them. If a multi-module starting point is wanted again, that is a decision about /assess.
// Plain data — safe to import from server and client components alike.
export const PACK_SLUG_MODULES: Record<string, string> = {
  supplier:   'ghg,supply',
  climate:    'ghg,risk',
  foundation: 'ghg,people,risk',
  investor:   'ghg,risk,supply,deals',
}
