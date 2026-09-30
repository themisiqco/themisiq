// app/dashboard/forced-labour/layout.tsx
// The Forced Labour Reporting builder (Canada's S-211 report first). Sold as a module since Stage 5a; what
// each account may do is decided by lib/s211/builderAccess.ts. The dashboard itself stays out of search
// engines; the public page is /forced-labour (Stage 5b).
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Forced Labour Reporting',
  robots: { index: false, follow: false },
}

export default function ForcedLabourLayout({ children }: { children: ReactNode }) {
  return children
}
