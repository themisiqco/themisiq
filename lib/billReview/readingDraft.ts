// lib/billReview/readingDraft.ts
//
// BR8: a specialist's reading as the staff form holds it before Save. Pure, client-safe. The dates start empty, never
// today's date (BR8 follow-up, 10 Oct 2026), and Save waits until every reading has its figure, unit, dates (both ends
// of the billing period, or the delivery date) and quote. The server checks all of it again (readingCheck.ts).

import { convertibleUnits, type FuelType } from '../unitConversions'

export type Draft = { fuelType: string; value: string; unit: string; dates: 'period' | 'delivery'; periodStart: string; periodEnd: string; deliveryDate: string; sourceQuote: string; notes: string; supersedes: string | null }

export const blankDraft = (fuel: string, supersedes: string | null = null): Draft =>
  ({ fuelType: fuel, value: '', unit: convertibleUnits(fuel as FuelType)[0] ?? '', dates: 'period', periodStart: '', periodEnd: '', deliveryDate: '', sourceQuote: '', notes: '', supersedes })

/** What a draft still needs before it can be saved, in the order the form shows it; empty when it is ready. */
export function draftMissing(d: Draft): string[] {
  const out: string[] = []
  if (d.value.trim() === '') out.push('the figure')
  if (!d.unit) out.push('the unit')
  if (d.dates === 'period') { if (!d.periodStart) out.push('the period start'); if (!d.periodEnd) out.push('the period end') }
  else if (!d.deliveryDate) out.push('the delivery date')
  if (!d.sourceQuote.trim()) out.push('the quote')
  return out
}
export const canSave = (drafts: Draft[]) => drafts.length > 0 && drafts.every(d => draftMissing(d).length === 0)
