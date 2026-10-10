// lib/billReview/spotCheckSample.ts
//
// BR8b (Q4, ruled 10 Oct 2026): THE SPOT-CHECK SAMPLE. 10% of the AI readings customers have confirmed, drawn at random
// and STABLE: a reading is in the sample when the first 8 hex digits of md5("{inventory}:{document}:{fuel}:{position}"),
// read as a number, are under 10 mod 100. The same reading is always in or always out, so a bill never drifts in and out
// of the sample. md5 does not change between versions. Never a human-read bill (a bill with a Bill Review mark, or a
// reading the team made), never a withdrawn bill, never a reading not confirmed. Oldest confirmed first.
// Server side only (node:crypto); used by lib/staff/spotChecks.ts.

import { createHash } from 'node:crypto'
import type { ExtractedProposal, Location, SourceDoc } from '../ghg/engine'

export const SAMPLE_PERCENT = 10
export const sampleKey = (inventoryId: string, docId: string, fuelType: string, index: number) => `${inventoryId}:${docId}:${fuelType}:${index}`
export const inSample = (key: string) => parseInt(createHash('md5').update(key).digest('hex').slice(0, 8), 16) % 100 < SAMPLE_PERCENT

export type SampleInventory = { id: string; user_id: string; company_name: string | null; reporting_year: number; fiscal_year_end_month: number | null; locations_data: Location[] | null }
export type SampleItem = { inventory: SampleInventory; location: Location; doc: SourceDoc; proposal: ExtractedProposal; index: number; key: string; confirmedAt: string }

/** A confirmed AI reading on a bill the AI read: the only kind a spot-check may look at. */
export function eligible(doc: SourceDoc, p: ExtractedProposal): boolean {
  return !doc.bill_review && !doc.withdrawn && p.status === 'confirmed' && p.readBy?.method !== 'human' && (p.confirmations?.length ?? 0) > 0
}

export function spotCheckSample(inventories: SampleInventory[], checked: Set<string>, limit = 50): SampleItem[] {
  const out: SampleItem[] = []
  for (const inv of inventories) for (const location of inv.locations_data ?? []) for (const doc of location.source_docs ?? []) {
    ;(doc.extracted ?? []).forEach((proposal, index) => {
      if (!eligible(doc, proposal)) return
      const key = sampleKey(inv.id, doc.id, proposal.fuelType, index)
      if (!inSample(key) || checked.has(key)) return
      out.push({ inventory: inv, location, doc, proposal, index, key, confirmedAt: proposal.confirmations![0].at })
    })
  }
  return out.sort((a, b) => Date.parse(a.confirmedAt) - Date.parse(b.confirmedAt) || a.key.localeCompare(b.key)).slice(0, limit)
}
