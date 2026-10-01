'use client'

// app/dashboard/forced-labour/_components/EntitiesPanel.tsx
// Who gives a country's statement, and which organisations it covers (Stage D1b, 1 Oct 2026). Per country, through
// fl_report_entities, so a UK subsidiary's statement and a Canadian parent's report can sit on one report. Saved in
// one transaction (public.fl_set_country_entities). UK-specific copy, so British spelling.

import { useState } from 'react'
import { flApi } from '../../../../lib/forcedLabour/client'
import { S } from './ui'
import type { CountryEntities } from './countryTypes'

const OTHER = '__other__'

export function EntitiesPanel({ id, country, entities, group, writable, onSaved }: {
  id: string; country: string; entities: CountryEntities; group: boolean; writable: boolean; onSaved: (e: CountryEntities) => void
}) {
  const initialGiving = entities.giving ?? entities.defaultGiving ?? ''
  const [giving, setGiving] = useState(initialGiving)
  const [choice, setChoice] = useState(entities.known.includes(initialGiving) ? initialGiving : (initialGiving ? OTHER : ''))
  const [covered, setCovered] = useState<string[]>(entities.covered.length ? entities.covered : (initialGiving ? [initialGiving] : []))
  const [extra, setExtra] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const names = [...new Set([...entities.known, ...covered])]

  const save = async () => {
    setMsg('Saving')
    const list = group ? [...new Set([giving.trim(), ...covered.map(c => c.trim())])].filter(Boolean) : [giving.trim()]
    const r = await flApi<{ entities: { giving: string; covered: string[] } }>(`/reports/${id}/countries/${country}/entities`, { method: 'PUT', body: { giving, covered: list } })
    if (!r.data) { setMsg(r.error ?? 'Not saved: check your connection'); return }
    onSaved({ ...entities, giving: r.data.entities.giving, covered: r.data.entities.covered, known: [...new Set([...entities.known, ...r.data.entities.covered])] })
    setMsg('Saved')
  }

  return (
    <div style={{ ...S.card }}>
      <fieldset disabled={!writable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label htmlFor="fl-giving" style={S.label}>Organisation giving the statement</label>
        <p style={S.hint}>The organisation whose board or members approve the statement and whose director or partner signs it. It can differ from the entity giving another country&rsquo;s report on this report.</p>
        <select id="fl-giving" style={{ ...S.input, maxWidth: 420, marginBottom: 8 }} value={choice}
          onChange={e => { setChoice(e.target.value); if (e.target.value !== OTHER) setGiving(e.target.value) }}>
          <option value="">Choose an organisation</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
          <option value={OTHER}>Another organisation</option>
        </select>
        {choice === OTHER && (
          <input aria-label="Legal name of the organisation giving the statement" style={{ ...S.input, maxWidth: 420, marginBottom: 8 }} value={giving} maxLength={300} onChange={e => setGiving(e.target.value)} />
        )}
        {group && (
          <>
            <p style={{ ...S.label, marginTop: 10 }}>Organisations the statement covers</p>
            <p style={S.hint}>Every organisation in the group that is required to produce a statement. The organisation giving it is always included.</p>
            {names.map(n => (
              <label key={n} style={{ display: 'flex', gap: 8, fontSize: 13.5, marginBottom: 4 }}>
                <input type="checkbox" checked={covered.includes(n) || n === giving} disabled={n === giving}
                  onChange={() => setCovered(c => (c.includes(n) ? c.filter(x => x !== n) : [...c, n]))} /> {n}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input aria-label="Add an organisation" placeholder="Add an organisation" style={{ ...S.input, maxWidth: 320 }} value={extra} maxLength={300} onChange={e => setExtra(e.target.value)} />
              <button type="button" style={S.buttonQuiet} onClick={() => { const n = extra.trim(); if (n && !covered.includes(n)) setCovered(c => [...c, n]); setExtra('') }}>Add</button>
            </div>
          </>
        )}
        {writable && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
            <button type="button" style={S.button} disabled={!giving.trim()} onClick={save}>Save the organisations</button>
            {msg && <span style={S.muted}>{msg}</span>}
          </div>
        )}
      </fieldset>
    </div>
  )
}
