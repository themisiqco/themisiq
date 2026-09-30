import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// The page itself is a client component (it runs the test in the browser), so its metadata lives here.
export const metadata: Metadata = {
  title: 'Does Canada’s S-211 Act Apply to You? Free Check | ThemisIQ',
  description:
    'Answer the questions that decide whether the Fighting Against Forced Labour and Child Labour in Supply Chains Act applies, with the Act and Public Safety Canada’s guidance quoted. Free, no account needed.',
  alternates: { canonical: '/forced-labour/canada/check' },
}

export default function ForcedLabourCheckLayout({ children }: { children: ReactNode }) {
  return children
}
