// lib/siteOrigin.ts
//
// THE SITE'S CANONICAL ORIGIN: https://www.themisiq.co (decided by Lisa, 5 Oct 2026). One constant for every link the
// server writes (app email, the sitemap, robots.txt, metadataBase) and for the fallbacks where a browser origin is
// not available.
//
// WHY www. Vercel serves www.themisiq.co as the Production domain and 307-redirects the apex (themisiq.co) to it, and
// Supabase Auth's Site URL is https://www.themisiq.co, so {{ .SiteURL }} in the sign-in email lands on www too. Linking
// to the apex costs every reader a redirect, and a sign-in session is stored per origin: one made on the apex is not
// visible on www. Supabase's redirect allow-list keeps https://themisiq.co/** as well, for links already sent.
//
// It replaced 'https://themisiq.co' (L5, 5 Oct 2026, the same day). The Supabase and Vercel settings are not readable
// from here; if the canonical host ever changes there, change this in the same pass (docs/review/design-lead1.md 10.1).
//
// A constant, not NEXT_PUBLIC_SITE_URL: a preview's results email still links to production, where the account and the
// saved calculation are (previews share the production Supabase project). Routes that already honoured
// NEXT_PUBLIC_SITE_URL keep doing so, with this as their fallback.

export const SITE_ORIGIN = 'https://www.themisiq.co'
