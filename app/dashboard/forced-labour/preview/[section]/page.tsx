'use client'

// app/dashboard/forced-labour/preview/[section]/page.tsx
// The read-only walkthrough of one section, for an account that has not bought Forced Labour Reporting
// (and for anyone else who opens it). No report is loaded and nothing is stored. "preview" is a static
// segment, so it takes precedence over the [id] route beside it.

import { use } from 'react'
import { isSectionKey } from '../../../../../lib/s211/builderContent'
import { PREVIEW_ID } from '../../../../../lib/s211/builderAccess'
import { BuilderFrame, NotFound404 } from '../../_components/ui'
import { SectionPage } from '../../_components/SectionPage'

export default function ForcedLabourPreviewSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params)
  if (!isSectionKey(section)) return <NotFound404 />
  return <BuilderFrame wide><SectionPage key={section} id={PREVIEW_ID} sectionKey={section} preview /></BuilderFrame>
}
