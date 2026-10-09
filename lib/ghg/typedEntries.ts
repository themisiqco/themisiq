// lib/ghg/typedEntries.ts
//
// T18: WHO TYPED EACH FIGURE, AND WHEN. Pure: no React, no clock (the caller passes the time), no Supabase.
//
// Rulings (docs/review/design-derived-figures.md section 10, "T18: typed figures", and Lisa, 9 Oct 2026):
//   - Every figure the customer types, where no document backs that field (or the customer entered it by hand
//     instead, T10), gets an entry `{ field, value, unit, at, by }` in the location's typed_entries.
//   - Written by the SAVE, one entry per change per save, never per keystroke: a field whose value or unit differs
//     from the last saved record gets one entry, attributed to the person saving, at the time of the save.
//   - The last saved record is the field's latest entry. A field with no entry yet is compared with the record as it
//     was loaded, so a figure saved before T18 and left unchanged is not attributed to whoever saves next. With no
//     loaded record (a new inventory), a field with no entry is compared with zero.
//   - Under a manual override, the entry also carries the override's reason.
//   - A free calculation claimed after sign-in: each typed figure gets one entry, attributed to the claiming person,
//     dated the claim day, with the note "entered before sign-in" (lib/ghg/freeCalc.ts).
//
// The workings row for a typed figure carries the latest entry as entered_by and entered_at, with the history
// (buildWorkings, typedOf).

import { UNIT_FIELDS, FIELD_NAME, activeOverride, isTypedFigure, isoDateInWords, type Location, type TypedEntry } from './engine'
import { unitLabel } from './unitLabels'

type Who = { userId: string; email: string }

/** The note on an entry made at the free-calculator claim for a figure typed before the customer signed in. */
export const ENTERED_BEFORE_SIGN_IN = 'entered before sign-in'

const fieldUnit = (unitField: keyof Location) => (loc: Location) => {
  const u = (loc as unknown as Record<string, unknown>)[String(unitField)]
  return typeof u === 'string' && u ? u : null
}
const fixed = (unit: string | null) => () => unit

/**
 * Every figure a customer can type, with the unit it is in. The activity figures (UNIT_FIELDS, electricity,
 * renewable electricity, refrigerant), the supplier's steam factor, biogenic CO2, and the miles and model year that
 * price a fleet line's methane and nitrous oxide.
 */
export const TYPED_FIGURE_FIELDS: readonly { field: keyof Location; unit: (loc: Location) => string | null }[] = [
  ...UNIT_FIELDS.map(f => ({ field: f.amount as keyof Location, unit: fieldUnit(f.field as keyof Location) })),
  { field: 'electricity_kwh', unit: fixed('kWh') },
  { field: 'renewable_electricity_kwh', unit: fixed('kWh') },
  { field: 'refrigerant_purchased_kg', unit: fixed('kg') },
  { field: 'purchased_steam_supplier_ef', unit: (loc: Location) => `kg CO2e per ${loc.purchased_steam_unit ?? 'mmbtu'}` },
  { field: 'biogenic_co2_mt', unit: fixed('t') },
  ...(['light_petrol_miles', 'light_diesel_miles', 'heavy_petrol_miles', 'heavy_diesel_miles'] as const).map(field => ({ field, unit: fixed('miles') })),
  ...(['light_model_year', 'heavy_model_year'] as const).map(field => ({ field, unit: fixed(null) })),
]

/** Per location id, per field: the typed value and unit as loaded. */
export type TypedBaseline = Record<string, Record<string, { value: number; unit: string | null }>>

const valueOf = (loc: Location, field: keyof Location): number => {
  const v = Number((loc as unknown as Record<string, unknown>)[String(field)] ?? 0)
  return Number.isFinite(v) ? v : 0
}

/** The typed figures of each location as loaded, for comparison on the next save. */
export function typedBaseline(locations: readonly Location[] | null | undefined): TypedBaseline {
  const out: TypedBaseline = {}
  for (const loc of locations ?? []) {
    out[loc.id] = {}
    for (const f of TYPED_FIGURE_FIELDS) out[loc.id][String(f.field)] = { value: valueOf(loc, f.field), unit: f.unit(loc) }
  }
  return out
}

/**
 * The location with an entry appended for each typed figure that changed since the last saved record. Fields read
 * from documents are skipped: their figure is derived, and their documents carry their own record.
 */
export function withTypedEntries(loc: Location, a: { by: Who; at: string; baseline?: TypedBaseline; note?: string }): Location {
  const added: TypedEntry[] = []
  for (const f of TYPED_FIGURE_FIELDS) {
    if (!isTypedFigure(loc, f.field)) continue
    const field = String(f.field)
    const value = valueOf(loc, f.field)
    const unit = f.unit(loc)
    const last = (loc.typed_entries ?? []).filter(e => e.field === field).at(-1)
    const before = last ?? a.baseline?.[loc.id]?.[field] ?? { value: 0, unit }
    if (before.value === value && (before.unit === unit || value === 0)) continue
    const override = activeOverride(loc, f.field)
    added.push({ field, value, unit, at: a.at, by: a.by, ...(override ? { overrideReason: override.reason } : {}), ...(a.note ? { note: a.note } : {}) })
  }
  return added.length ? { ...loc, typed_entries: [...(loc.typed_entries ?? []), ...added] } : loc
}

// T18 diff 4: the names of the typed figures FIELD_NAME (the activity fields) does not cover.
const EXTRA_FIELD_NAME: Record<string, string> = {
  purchased_steam_supplier_ef: "the steam supplier's emission factor",
  light_petrol_miles: 'miles driven, petrol light vehicles', light_diesel_miles: 'miles driven, diesel light vehicles',
  heavy_petrol_miles: 'miles driven, petrol heavy vehicles', heavy_diesel_miles: 'miles driven, diesel heavy vehicles',
  light_model_year: 'light vehicle model year', heavy_model_year: 'heavy vehicle model year',
}
/** A typed figure's field in words: "natural gas", "miles driven, petrol light vehicles". */
export const typedFieldName = (field: string): string => FIELD_NAME[field] ?? EXTRA_FIELD_NAME[field] ?? field.replace(/_/g, ' ')

/**
 * T18 diff 4: one typed entry as the evidence list shows it. Plain, no em dash.
 * "Natural gas entered as 420 Mcf by jo@acme.example on 2 October 2026."
 */
export function typedEntrySentence(e: TypedEntry): string {
  const name = typedFieldName(e.field)
  // A model year is a year, so it takes no thousands separator.
  const figure = `${e.value.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: !e.field.endsWith('_model_year') })}${e.unit ? ` ${unitLabel(e.unit)}` : ''}`
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} entered as ${figure} by ${e.by.email} on ${isoDateInWords(e.at.slice(0, 10))}`
    + `${e.note ? ` (${e.note})` : ''}${e.overrideReason ? `, by hand instead of from the bills: ${e.overrideReason}` : ''}.`
}
