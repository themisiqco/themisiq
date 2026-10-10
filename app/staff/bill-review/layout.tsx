// app/staff/bill-review/layout.tsx
// BR8: the Bill Review specialist page. Kept out of search engines (and out of the sitemap; robots.ts disallows /staff).
// Access is the data's: every datum and document comes from /api/staff/bill-review/*, behind requireStaffRole.
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Bill Review: specialist queue',
  robots: { index: false, follow: false },
}

export default function StaffBillReviewLayout({ children }: { children: ReactNode }) {
  return children
}
