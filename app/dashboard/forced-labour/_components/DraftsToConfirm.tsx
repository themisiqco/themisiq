'use client'

// app/dashboard/forced-labour/_components/DraftsToConfirm.tsx
// On a country's check page: every answer started from another country's report and saved without being edited or
// confirmed (lib/forcedLabour/drafts.ts). Export is refused while any is left (the country's export gate). Each has
// a link to its section and the confirm action. Shown only when there is one.

import Link from 'next/link'
import { draftBadge, draftConfirmLabel } from '../../../../lib/forcedLabour/drafts'
import type { CountryKey } from '../../../../lib/forcedLabour/countries'
import { S } from './ui'

export type DraftItem = { section: string; sectionTitle: string; href: string; field: string; label: string; from: CountryKey }

export function DraftsToConfirm({ items, to, writable, onConfirm }: {
  items: DraftItem[]; to: CountryKey; writable: boolean; onConfirm: (section: string, field: string) => void
}) {
  if (items.length === 0) return null
  return (
    <>
      <h2 style={S.h2}>Answers started from another country&rsquo;s report</h2>
      <p style={S.warn}>The report cannot be exported while any of these is unconfirmed. Edit each in its section, or confirm it here.</p>
      {items.map(d => (
        <div key={`${d.section}.${d.field}`} style={{ ...S.card, padding: '12px 16px' }}>
          <p style={{ ...S.body, margin: 0 }}><Link href={d.href}>{d.sectionTitle}</Link>: {d.label}</p>
          <p style={{ ...S.hint, margin: '4px 0 8px' }}>{draftBadge(d.from, to)}</p>
          {writable && <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px' }} onClick={() => onConfirm(d.section, d.field)}>{draftConfirmLabel(to)}</button>}
        </div>
      ))}
    </>
  )
}
