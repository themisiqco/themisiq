'use client'
// app/dashboard/ghg/_components/FleetBlock.tsx
//
// FI9 diff 3 (ruling R16): fleet fuel by vehicle type, for one location. The words and the state changes are in
// lib/ghg/fleetForm.ts; the page supplies the figure inputs (FigureInput, the unit select, UnpricedNote and
// UnitChangeNote, exactly as for every other fuel) through `figure`, and applies every change through the callbacks.
// With one tick and one fuel the block is three or four lines.

import { useState } from 'react'
import type { Location } from '@/lib/ghg/engine'
import type { FleetType } from '@/lib/emissionFactors/mobile/types'
import {
  FLEET_QUESTION, FLEET_TICK_LABEL, FLEET_TYPE_NAME, FLEET_FUEL_LABEL, MODEL_YEAR_LABEL, MODEL_YEAR_HINT, MILES_LABEL,
  MILES_HINT, EQUIPMENT_LABEL, EQUIPMENT_OPTIONS, fieldsOf, typeTicked, modelYearProblem, untickQuestion, fleetChangeFor,
  legacyFleetText, type legacyFleetFigures,
} from '@/lib/ghg/fleetForm'

const TYPES: FleetType[] = ['light', 'heavy', 'non_road']

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.5 }
const warn: React.CSSProperties = { fontSize: 12, color: '#92400e', lineHeight: 1.5 }
const btn: React.CSSProperties = { fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4', background: '#f8f7f5', cursor: 'pointer' }
const small: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '0.5px solid #e8e7e4', borderRadius: 8, background: '#fff' }

export interface FleetBlockProps {
  loc: Location
  /** Miles are asked (US sites), and equipment type per fuel (where the publisher splits non-road by it). */
  asks: { miles: boolean; equipment: { petrol: boolean; diesel: boolean } }
  now: Date
  /** The figure input row for one fleet field: the page's FigureInput, unit select and notes. */
  figure: (amountField: keyof Location, unitField: keyof Location) => React.ReactNode
  legacy: ReturnType<typeof legacyFleetFigures>
  /** The last refusal from a legacy button, in plain words, or null. */
  legacyRefusal: string | null
  /** A type the customer asked to untick while it holds figures: the question is shown for it. */
  pendingUntick: FleetType | null
  onTick: (type: FleetType, ticked: boolean) => void
  onUntickAnswer: (type: FleetType, answer: 'remove' | 'keep') => void
  onModelYear: (type: FleetType, raw: string) => void
  onMiles: (field: keyof Location, miles: number | undefined) => void
  onEquipment: (field: keyof Location, value: string | undefined) => void
  onAssignLegacy: (from: 'gasoline_amount' | 'diesel_mobile_amount', to: FleetType) => void
}

export function FleetBlock(p: FleetBlockProps) {
  const { loc } = p
  const site = loc.name || 'Location'
  // A typed model year that is not one we accept is kept here, with its message, and never stored.
  const [yearDraft, setYearDraft] = useState<Partial<Record<FleetType, string>>>({})
  const val = (k: keyof Location | undefined) => (k ? (loc as unknown as Record<string, unknown>)[k] : undefined)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
      {p.legacy.map(l => (
        <div key={l.field} data-legacy={l.field} style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
          <div style={warn}>{legacyFleetText(l.value, l.unit, l.fuel)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' as const }}>
            {TYPES.map(t => (
              <button key={t} type="button" style={btn} onClick={() => p.onAssignLegacy(l.field, t)}>{FLEET_TYPE_NAME[t]}</button>
            ))}
          </div>
        </div>
      ))}
      {p.legacyRefusal && <div role="status" style={warn}>{p.legacyRefusal}</div>}

      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>{FLEET_QUESTION}</legend>
        {TYPES.map(t => (
          <label key={t} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 4 }}>
            <input type="checkbox" id={`fleet-${loc.id}-${t}`} name={`fleet-${t}`} checked={typeTicked(loc, t)} onChange={e => p.onTick(t, e.target.checked)} />
            {FLEET_TICK_LABEL[t]}
          </label>
        ))}
      </fieldset>

      {TYPES.map(t => {
        if (p.pendingUntick === t) {
          return (
            <div key={t} role="alertdialog" style={{ border: '0.5px solid #fde68a', background: '#FEF3E2', borderRadius: 8, padding: '10px 12px' }}>
              <div style={warn}>{untickQuestion(t, site)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" style={btn} onClick={() => p.onUntickAnswer(t, 'remove')}>Remove</button>
                <button type="button" style={btn} onClick={() => p.onUntickAnswer(t, 'keep')}>Keep</button>
              </div>
            </div>
          )
        }
        if (!typeTicked(loc, t)) return null
        const fields = fieldsOf(t)
        const yearField = fields[0].modelYear
        const stored = val(yearField)
        const draft = yearDraft[t] ?? (typeof stored === 'number' ? String(stored) : '')
        const yearMsg = modelYearProblem(draft, p.now)
        return (
          <div key={t} data-fleet-group={t} style={{ borderLeft: '2px solid #e8e7e4', paddingLeft: 12, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{FLEET_TYPE_NAME[t]}</div>
            {fields.map(f => {
              const hasFigure = Number(val(f.amount) ?? 0) > 0
              const miles = val(f.miles)
              const eq = val(f.equipment)
              const cleared = fleetChangeFor(loc, f.miles) ?? fleetChangeFor(loc, f.equipment)
              return (
                <div key={String(f.amount)} style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  <div style={{ fontSize: 12, color: '#555553' }}>{FLEET_FUEL_LABEL[f.fuel]}</div>
                  {p.figure(f.amount, f.unit)}
                  {f.miles && p.asks.miles && hasFigure && (
                    <label style={{ ...muted, display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                      {MILES_LABEL}
                      <input type="number" min={0} name={String(f.miles)} value={typeof miles === 'number' ? miles : ''} style={small}
                        onChange={e => p.onMiles(f.miles!, e.target.value === '' ? undefined : Number(e.target.value))} />
                      <span>{MILES_HINT}</span>
                    </label>
                  )}
                  {f.equipment && p.asks.equipment[f.fuel] && hasFigure && (
                    <label style={{ ...muted, display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                      {EQUIPMENT_LABEL}
                      <select name={String(f.equipment)} value={typeof eq === 'string' ? eq : ''} style={small}
                        onChange={e => p.onEquipment(f.equipment!, e.target.value || undefined)}>
                        <option value="">Choose…</option>
                        {EQUIPMENT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </label>
                  )}
                  {cleared && <div style={muted}>{cleared.message}</div>}
                </div>
              )
            })}
            {yearField && (
              <label style={{ ...muted, display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                {MODEL_YEAR_LABEL}
                <input type="number" name={String(yearField)} inputMode="numeric" value={draft} style={{ ...small, width: 110 }}
                  onChange={e => { setYearDraft(d => ({ ...d, [t]: e.target.value })); p.onModelYear(t, e.target.value) }} />
                {yearMsg ? <span role="alert" style={warn}>{yearMsg}</span> : <span>{MODEL_YEAR_HINT}</span>}
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
