// app/dashboard/s211/layout.tsx
// The S-211 report builder: unpriced and gated by public.s211_access (lib/s211/access.ts). Kept out of search
// engines, and linked from nowhere: not the navigation, the dashboard or the sitemap.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'S-211 report builder',
  robots: { index: false, follow: false },
}

export default function S211Layout({ children }: { children: ReactNode }) {
  return children
}
