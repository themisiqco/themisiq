// lib/billReview/readingCheck.ts
//
// BR8: THE SERVER'S CHECK OF A SPECIALIST'S READING, before it is saved. Pure. Ruled 10 Oct 2026 (BR8 decision 3): the
// server re-checks every field rather than trusting the form, so a reading reaches the customer in the shape the AI's
// does and converts as extraction does (lib/billReview/mergeReadings.ts, readingToProposal).
//   - fuel:   one the bill's document type can carry (fieldFor);
//   - value:  a finite number, 0 or more;
//   - unit:   one of convertibleUnits(fuel), and never a tier 3 conversion (it would arrive needing manual review);
//   - dates:  a billing period (start on or before end), or a delivery date for a delivery document type only (T10b,
//             DELIVERY_DOC_TYPES), never both, never neither; real calendar dates;
//   - quote:  required, the exact figure and unit as printed, at most 300 characters;
//   - notes:  optional, at most 1000 characters;
//   - supersedes: optional, a reading id (the database checks it is a reading of the same bill).
// Who read it comes from the session, never from here.

import { fieldFor } from '../ghg/engine'
import { DELIVERY_DOC_TYPES } from '../ghg/conciergeDocTypes'
import { convertibleUnits, convertToCanonical, type FuelType } from '../unitConversions'
import { SUPPORTED_FUELS } from '../ghg/conciergeDocTypes'

export type ReadingInput = {
  fuelType?: unknown; value?: unknown; unit?: unknown; periodStart?: unknown; periodEnd?: unknown; deliveryDate?: unknown
  sourceQuote?: unknown; notes?: unknown; supersedes?: unknown
}
export type ReadingRowInsert = {
  fuel_type: string; raw_value: number; raw_unit: string; period_start: string | null; period_end: string | null
  delivery_date: string | null; source_quote: string; notes: string | null; supersedes: string | null
}
export const QUOTE_MAX = 300
export const NOTES_MAX = 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : null
}
const blank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

/** The fuels a specialist may record for a document type, in the order the AI reader knows them. */
export const fuelsFor = (documentType: string): FuelType[] => (SUPPORTED_FUELS as readonly FuelType[]).filter(f => fieldFor(documentType, f) !== null)

export function checkReading(documentType: string, r: ReadingInput): { ok: true; row: ReadingRowInsert } | { ok: false; error: string } {
  const fuel = r.fuelType
  if (typeof fuel !== 'string' || !fuelsFor(documentType).includes(fuel as FuelType)) return { ok: false, error: 'Choose a fuel this kind of document carries.' }
  const value = typeof r.value === 'number' ? r.value : typeof r.value === 'string' && r.value.trim() !== '' ? Number(r.value) : NaN
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: 'Enter the figure as a number, 0 or more.' }
  const unit = r.unit
  if (typeof unit !== 'string' || !convertibleUnits(fuel as FuelType).includes(unit)) return { ok: false, error: 'Choose a unit this fuel is read in.' }
  if (convertToCanonical(fuel as FuelType, value, unit).tier === 3) return { ok: false, error: 'That unit cannot be converted for this fuel. Choose another.' }
  const start = blank(r.periodStart) ? null : isoDate(r.periodStart)
  const end = blank(r.periodEnd) ? null : isoDate(r.periodEnd)
  const delivery = blank(r.deliveryDate) ? null : isoDate(r.deliveryDate)
  if ((!blank(r.periodStart) && !start) || (!blank(r.periodEnd) && !end) || (!blank(r.deliveryDate) && !delivery)) return { ok: false, error: 'Enter dates as real calendar dates.' }
  const hasPeriod = !!start || !!end
  if (hasPeriod && delivery) return { ok: false, error: 'Enter a billing period or a delivery date, not both.' }
  if (hasPeriod) {
    if (!start || !end) return { ok: false, error: 'Enter both the start and the end of the billing period.' }
    if (start > end) return { ok: false, error: 'The billing period ends before it starts.' }
  } else if (delivery) {
    if (!DELIVERY_DOC_TYPES.has(documentType)) return { ok: false, error: 'This kind of bill has a billing period, not a delivery date.' }
  } else {
    return { ok: false, error: DELIVERY_DOC_TYPES.has(documentType) ? 'Enter the billing period or the delivery date.' : 'Enter the billing period.' }
  }
  const quote = typeof r.sourceQuote === 'string' ? r.sourceQuote.trim() : ''
  if (!quote) return { ok: false, error: 'Copy the figure and its unit exactly as printed on the bill.' }
  if (quote.length > QUOTE_MAX) return { ok: false, error: `Keep the quote to ${QUOTE_MAX} characters.` }
  const notes = typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null
  if (notes && notes.length > NOTES_MAX) return { ok: false, error: `Keep the notes to ${NOTES_MAX} characters.` }
  const supersedes = blank(r.supersedes) ? null : typeof r.supersedes === 'string' && UUID.test(r.supersedes) ? r.supersedes : undefined
  if (supersedes === undefined) return { ok: false, error: 'The reading this corrects is not recognised.' }
  return { ok: true, row: { fuel_type: fuel, raw_value: value, raw_unit: unit, period_start: start, period_end: end, delivery_date: delivery, source_quote: quote, notes, supersedes } }
}
