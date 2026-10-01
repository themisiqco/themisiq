'use client'

// app/dashboard/forced-labour/[id]/[country]/[section]/page.tsx
// One section of a country other than Canada (../../canada/[section] is Canada's). The page is
// _components/CountrySectionPage.tsx; a country or section this account may not see is a 404.

import { use } from 'react'
import { BuilderFrame } from '../../../_components/ui'
import { CountryTabs } from '../../../_components/CountryTabs'
import { CountrySectionPage } from '../../../_components/CountrySectionPage'

export default function CountrySectionRoute({ params }: { params: Promise<{ id: string; country: string; section: string }> }) {
  const { id, country, section } = use(params)
  return <BuilderFrame wide report><CountryTabs id={id} current={country} /><CountrySectionPage key={`${country}:${section}`} id={id} country={country} sectionKey={section} /></BuilderFrame>
}
