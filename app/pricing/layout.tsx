import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing | ThemisIQ',
  description:
    'Per-module pricing for the ThemisIQ platform. Build your stack from the modules your obligations require, with discounts when you take two or more.',
  alternates: { canonical: '/pricing' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
