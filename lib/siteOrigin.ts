// lib/siteOrigin.ts
//
// THE SITE'S ORIGIN FOR LINKS IN APP EMAIL (LEAD1 L5, Oct 2026): https://themisiq.co, no www.
//
// It is the origin Supabase Auth's Site URL is set to (Lisa, 5 Oct 2026), which is what {{ .SiteURL }} puts in the
// sign-in code email's link (docs/review/design-lead1.md section 10). The results email links to the same origin, so a
// recipient sees one address for ThemisIQ in both emails, and the sign-in a link may need happens on that origin's
// storage. The value lives in the Supabase dashboard and is not readable from here; if it ever changes there, change
// it here in the same pass.
//
// A constant, not NEXT_PUBLIC_SITE_URL: a preview deployment's results email still links to production, where the
// account and the saved calculation are (previews share the production Supabase project).

export const SITE_ORIGIN = 'https://themisiq.co'
