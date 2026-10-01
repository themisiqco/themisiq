'use client'

// app/dashboard/forced-labour/_components/CountryTabs.tsx
// The tabs across a report: Overview, then each country on it, in the order the report holds them (Canada
// first). The primary navigation of a report since Stage D1 (1 Oct 2026). The list comes from
// /api/forced-labour/reports/[id], which leaves out any country this account may not see, so a country in
// preview has no tab for anyone outside the preview list.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { flApi, type Overview } from '../../../../lib/forcedLabour/client'
import { COUNTRIES } from '../../../../lib/forcedLabour/countries'
import { BUILDER_ROOT } from '../../../../lib/s211/builderAccess'

export function useOverview(id: string): { overview: Overview | null; status: number | null; reload: () => void } {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    void flApi<Overview>(`/reports/${id}`).then(r => { if (live) { setStatus(r.status); setOverview(r.data) } })
    return () => { live = false }
  }, [id, n])
  return { overview, status, reload: () => setN(x => x + 1) }
}

export const countryName = (k: string) => COUNTRIES.find(c => c.key === k)?.name ?? k

export function CountryTabs({ id, current, overview: given }: { id: string; current: string; overview?: Overview | null }) {
  const fetched = useOverview(id)
  const overview = given !== undefined ? given : fetched.overview
  const tabs = [{ key: 'overview', label: 'Overview', href: `${BUILDER_ROOT}/${id}` },
    // No country tab until the report says which it has: a report need not have Canada (Stage D1b).
    ...(overview?.countries ?? []).map(c => ({ key: c.country, label: countryName(c.country), href: `${BUILDER_ROOT}/${id}/${c.country}` }))]
  return (
    <nav aria-label="Countries on this report" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid #e8e7e4', margin: '6px 0 16px' }}>
      {tabs.map(t => {
        const on = t.key === current
        return (
          <Link key={t.key} href={t.href} aria-current={on ? 'page' : undefined}
            style={{ padding: '8px 14px', fontSize: 13.5, textDecoration: 'none', color: 'var(--color-ink)', fontWeight: on ? 600 : 400,
              borderBottom: on ? '3px solid var(--color-brand)' : '3px solid transparent', marginBottom: -1 }}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** The "Shared" badge on a shared section or field, with where its answer came from when known. */
export function SharedBadge({ text }: { text: string }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#E6F1F3', color: 'var(--color-brand)', whiteSpace: 'nowrap' }}>{text}</span>
}

/**
 * A draft started from another country's answer (lib/forcedLabour/drafts.ts): where it came from, the scope to
 * check, and a way to confirm it. Editing the field clears the mark too.
 */
export function DraftNotice({ text, confirmLabel, onConfirm, disabled }: { text: string; confirmLabel: string; onConfirm: () => void; disabled?: boolean }) {
  return (
    <div role="note" style={{ border: '1px solid #e8d9b5', background: '#FEF7EC', borderRadius: 8, padding: '6px 10px', margin: '0 0 6px', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 200 }}>{text}</span>
      {!disabled && <button type="button" style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, border: '1px solid #d6d4cf', background: '#fff', cursor: 'pointer' }} onClick={onConfirm}>{confirmLabel}</button>}
    </div>
  )
}

