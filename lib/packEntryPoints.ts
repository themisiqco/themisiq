// Single source of truth for the use-case "pack" → configurator module sets.
// Values are LEGACY pricing-page module ids (must match VALID_MODULE_IDS in
// app/pricing/page.tsx: ghg | risk | supply | people | deals | ai | cyber).
//
// Referenced by BOTH the homepage pack cards (app/page.tsx) and the flag-gated
// redirects on the /get-started/* routes, so the two can't drift. Plain data —
// safe to import from server and client components alike.
export const PACK_SLUG_MODULES: Record<string, string> = {
  supplier:   'ghg,supply',
  climate:    'ghg,risk',
  foundation: 'ghg,people,risk',
  investor:   'ghg,risk,supply,deals',
}
