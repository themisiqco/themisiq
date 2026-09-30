'use client'
// app/dashboard/deals/MarketPicker.tsx
// "Where does the target sell or operate?": the deal wizard's market multi-select.
//
// Stores what deals.sales_markets holds: ISO 3166-1 alpha-2 codes plus 'US-CA' for California, or
// NULL when nothing is picked. "Not sure" is its own column (sales_markets_not_sure), so a partial list
// and "not sure" can both be recorded. Countries come from the product's one country list
// (lib/emissionFactors/countryOptions.ts), searched with the same matching every country control uses.
//
// EU members are listed under one "European Union" group that ticks all 27 at once; each member can
// still be picked on its own. California sits under the United States as its own option, because it
// brings in its own rule (AB 1305) as well as the federal one.

import { useMemo, useState } from 'react'
import { COUNTRY_OPTIONS, matchCountries } from '../../../lib/emissionFactors/countryOptions'
import { EU_MEMBER_CODES, US_CA, isEuMember } from '../../../lib/deals/markets'
import { marketName } from '../../../lib/deals/claimsRules'

type Props = {
  markets: string[] | null
  notSure: boolean | null
  onChange: (markets: string[] | null, notSure: boolean | null) => void
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', fontSize: 13, cursor: 'pointer', color: 'var(--color-ink)' }

export default function MarketPicker({ markets, notSure, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [euOpen, setEuOpen] = useState(false)
  const selected = useMemo(() => new Set(markets ?? []), [markets])

  // NULL, not [], when nothing is picked: an empty list would read as "sells nowhere".
  const commit = (next: Set<string>, ns: boolean | null = notSure) => onChange(next.size ? [...next] : null, ns)
  const toggle = (code: string) => {
    const next = new Set(selected)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    commit(next)
  }

  const euPicked = EU_MEMBER_CODES.filter(c => selected.has(c)).length
  const toggleEu = () => {
    const next = new Set(selected)
    if (euPicked === EU_MEMBER_CODES.length) EU_MEMBER_CODES.forEach(c => next.delete(c))
    else EU_MEMBER_CODES.forEach(c => next.add(c))
    commit(next)
  }

  const byName = useMemo(() => [...COUNTRY_OPTIONS].sort((a, b) => a.display_name.localeCompare(b.display_name)), [])
  const searching = query.trim().length > 0
  // Searching lists every match, EU members included and tagged; browsing lists the EU once, as its
  // group, then every other country.
  const shown = searching ? matchCountries(query, COUNTRY_OPTIONS.length) : byName.filter(c => !isEuMember(c.iso2))
  const euMembers = byName.filter(c => isEuMember(c.iso2))
  // California is not in the country list, so a search for it is answered here.
  const californiaMatch = searching && 'california'.startsWith(query.trim().toLowerCase())

  const box = (code: string, label: string, indent = 0, tag?: string) => (
    <label key={code} style={{ ...rowStyle, paddingLeft: 8 + indent }}>
      <input type="checkbox" checked={selected.has(code)} onChange={() => toggle(code)} />
      <span>{label}</span>
      {tag && <span style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{tag}</span>}
    </label>
  )

  return (
    <div>
      <label style={{ ...rowStyle, padding: '0 0 8px' }}>
        <input type="checkbox" checked={notSure === true} onChange={e => commit(selected, e.target.checked ? true : null)} />
        <span>Not sure</span>
      </label>

      {selected.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {[...selected].map(code => (
            <button key={code} type="button" onClick={() => toggle(code)} aria-label={`Remove ${marketName(code)}`}
              style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, border: '0.5px solid var(--color-line)', background: 'var(--color-accent-neutral-wash)', color: 'var(--color-ink)', cursor: 'pointer' }}>
              {marketName(code)} ×
            </button>
          ))}
        </div>
      )}

      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search countries"
        aria-label="Search countries"
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '0.5px solid var(--color-line)', marginBottom: 6 }} />

      <div style={{ maxHeight: 240, overflowY: 'auto', border: '0.5px solid var(--color-line)', borderRadius: 8, padding: '4px 0' }}>
        {!searching && (
          <div>
            <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={euPicked === EU_MEMBER_CODES.length}
                  ref={el => { if (el) el.indeterminate = euPicked > 0 && euPicked < EU_MEMBER_CODES.length }}
                  onChange={toggleEu} />
                <span style={{ fontWeight: 600 }}>European Union</span>
                <span style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{euPicked ? `${euPicked} of ${EU_MEMBER_CODES.length}` : `all ${EU_MEMBER_CODES.length} members`}</span>
              </label>
              <button type="button" onClick={() => setEuOpen(o => !o)} aria-expanded={euOpen}
                style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--color-brand)', cursor: 'pointer' }}>
                {euOpen ? 'Hide members' : 'Choose members'}
              </button>
            </div>
            {euOpen && euMembers.map(c => box(c.iso2, c.display_name, 24))}
          </div>
        )}
        {californiaMatch && !shown.some(c => c.iso2 === 'US') && box(US_CA, 'California', 0, 'United States')}
        {shown.map(c => (
          <div key={c.iso2}>
            {box(c.iso2, c.display_name, 0, searching && isEuMember(c.iso2) ? 'EU' : undefined)}
            {c.iso2 === 'US' && box(US_CA, 'California', 24)}
          </div>
        ))}
        {searching && shown.length === 0 && !californiaMatch && (
          <div style={{ ...rowStyle, color: 'var(--color-ink-muted)', cursor: 'default' }}>No country matches &ldquo;{query}&rdquo;.</div>
        )}
      </div>
    </div>
  )
}
