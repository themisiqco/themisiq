'use client'

// app/dashboard/forced-labour/[id]/[section]/page.tsx
// One section of a report. The page itself is _components/SectionPage.tsx, shared with the preview
// walkthrough (../../preview/[section]/page.tsx).

import { use } from 'react'
import { isSectionKey } from '../../../../../lib/s211/builderContent'
import { BuilderFrame, NotFound404 } from '../../_components/ui'
import { SectionPage } from '../../_components/SectionPage'

export default function ForcedLabourSectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = use(params)
  if (!isSectionKey(section)) return <NotFound404 />
  // Keyed by section: moving between sections mounts a fresh page, so each reads its own first visit.
  return <BuilderFrame wide report><SectionPage key={section} id={id} sectionKey={section} /></BuilderFrame>
}
