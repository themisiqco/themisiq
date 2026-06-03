// app/dashboard/materiality/page.tsx
// The materiality wizard has moved to its module home at /dashboard/climate-risk
// (the Climate Risk & Materiality module). This server component redirects the
// old path there, preserving the ?mode= query param used by the pricing packs
// (?mode=csrd / ?mode=s2) so it survives the move.
//
// NOTE: this redirect is on the /dashboard/materiality PAGE only. The child
// route /dashboard/materiality/report is a separate segment and is NOT affected
// — it continues to render the CSRD / IFRS S2 (matrix) report.

import { redirect } from 'next/navigation'

export default async function MaterialityRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const mode = typeof sp.mode === 'string' ? sp.mode : undefined
  redirect(mode ? `/dashboard/climate-risk?mode=${encodeURIComponent(mode)}` : '/dashboard/climate-risk')
}
