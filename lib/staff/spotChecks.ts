import 'server-only'
// lib/staff/spotChecks.ts
//
// BR8b: SPOT-CHECKS, server side. Each function takes a Staff from requireStaffRole and writes its staff_access_log
// row FIRST (a failed write fails the request, nothing served or saved).
//   sampleSpotChecks   view_spot_checks    the 10% stable sample of confirmed AI readings not yet checked
//                                          (lib/billReview/spotCheckSample.ts), oldest confirmed first
//   openSpotCheck      view_ai_reading     the AI's reading as the customer confirmed it, and the bill through
//                                          signStaffDocument (view_document, 300 s)
//   recordSpotCheck    record_spot_check   agrees, or disagrees with a note; who and when (the guard checks the role)
// A reading is reached only if it is in the sample now: never one outside it, never a human-read bill, never a path from
// the browser. SEC-01: the bill's path must be under the inventory owner's user id.
// PRE-LAUNCH: the sample reads every inventory's locations_data; a later change can move it into SQL when volume asks.

import { logStaffAccess, signStaffDocument, type Staff } from './access'
import { spotCheckSample, sampleKey, inSample, eligible, type SampleInventory } from '../billReview/spotCheckSample'
import { yearLabel } from '../ghg/reportingYear'
import { docTypeLabel } from '../ghg/conciergeDocTypes'

type Refusal = { ok: false; status: 400 | 404 | 409 | 503; error: string }
const fail = (status: Refusal['status'], error: string): Refusal => ({ ok: false, status, error })
const INV_COLS = 'id, user_id, company_name, reporting_year, fiscal_year_end_month, locations_data'
const readingOf = (p: Record<string, unknown>) => ({ value: p.value ?? null, unit: p.unit ?? null, rawValue: p.rawValue ?? null, rawUnit: p.rawUnit ?? null,
  periodStart: p.periodStart ?? null, periodEnd: p.periodEnd ?? null, deliveryDate: p.deliveryDate ?? null, sourceQuote: p.sourceQuote ?? null })

async function checkedKeys(staff: Staff): Promise<Set<string> | null> {
  const { data, error } = await staff.admin.from('bill_review_spot_checks').select('inventory_id, source_doc_id, fuel_type, proposal_index')
  if (error) return null
  return new Set((data ?? []).map(r => sampleKey(r.inventory_id as string, r.source_doc_id as string, r.fuel_type as string, r.proposal_index as number)))
}

export async function sampleSpotChecks(staff: Staff) {
  await logStaffAccess(staff, { action: 'view_spot_checks' })
  const { data: invs, error } = await staff.admin.from('ghg_inventories').select(INV_COLS)
  if (error || !invs) return fail(503, 'The inventories could not be read.')
  const checked = await checkedKeys(staff)
  if (!checked) return fail(503, 'The spot-checks could not be read.')
  const items = spotCheckSample(invs as SampleInventory[], checked).map(s => ({
    inventoryId: s.inventory.id, sourceDocId: s.doc.id, fuelType: s.proposal.fuelType, proposalIndex: s.index,
    company: s.inventory.company_name, year: yearLabel(s.inventory.reporting_year, s.inventory.fiscal_year_end_month ?? 12).inText,
    site: s.location.name, fileName: s.doc.file_name, documentType: docTypeLabel(s.doc.document_type), confirmedAt: s.confirmedAt,
  }))
  return { ok: true as const, items }
}

/** The reading a request names, if it is in the sample, eligible and not yet checked. */
async function sampled(staff: Staff, b: Record<string, unknown>) {
  const { inventoryId, sourceDocId, fuelType, proposalIndex } = b
  if (typeof inventoryId !== 'string' || typeof sourceDocId !== 'string' || typeof fuelType !== 'string' || typeof proposalIndex !== 'number') return fail(400, 'Name the reading to check.')
  const { data: inv, error } = await staff.admin.from('ghg_inventories').select(INV_COLS).eq('id', inventoryId).maybeSingle()
  if (error) return fail(503, 'The inventory could not be read.')
  if (!inv) return fail(404, 'No such inventory.')
  const i = inv as SampleInventory
  const location = (i.locations_data ?? []).find(l => (l.source_docs ?? []).some(d => d.id === sourceDocId))
  const doc = location?.source_docs.find(d => d.id === sourceDocId)
  const proposal = doc?.extracted?.[proposalIndex]
  const key = sampleKey(i.id, sourceDocId, fuelType, proposalIndex)
  if (!location || !doc || !proposal || proposal.fuelType !== fuelType || !eligible(doc, proposal) || !inSample(key)) return fail(409, 'That reading is not in the spot-check sample.')
  if (!doc.file_path.startsWith(`${i.user_id}/`)) {
    console.warn('[staff/spot-check] path outside the owner folder; refused', { inventoryId: i.id })
    return fail(409, 'This bill’s stored file does not match the inventory. It cannot be opened.')
  }
  return { ok: true as const, inv: i, location, doc, proposal, index: proposalIndex, key }
}

export async function openSpotCheck(staff: Staff, b: Record<string, unknown>) {
  const s = await sampled(staff, b)
  if (!s.ok) return s
  await logStaffAccess(staff, { action: 'view_ai_reading', documentRef: s.key, inventoryId: s.inv.id })
  const url = await signStaffDocument(staff, { path: s.doc.file_path, inventoryId: s.inv.id })
  return { ok: true as const, url, reading: readingOf(s.proposal as unknown as Record<string, unknown>),
    bill: { company: s.inv.company_name, site: s.location.name, fileName: s.doc.file_name, documentType: docTypeLabel(s.doc.document_type), fuelType: s.proposal.fuelType } }
}

export async function recordSpotCheck(staff: Staff, b: Record<string, unknown>) {
  if (b.result !== 'agrees' && b.result !== 'disagrees') return fail(400, 'Record whether the reading agrees with the bill.')
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null
  if (b.result === 'disagrees' && !note) return fail(400, 'Say what the difference is. The customer reads this note.')
  if (note && note.length > 500) return fail(400, 'Keep the note to 500 characters.')
  const s = await sampled(staff, b)
  if (!s.ok) return s
  const checked = await checkedKeys(staff)
  if (!checked) return fail(503, 'The spot-checks could not be read.')
  if (checked.has(s.key)) return fail(409, 'This reading has already been checked.')
  await logStaffAccess(staff, { action: 'record_spot_check', documentRef: s.key, inventoryId: s.inv.id })
  const { error } = await staff.admin.from('bill_review_spot_checks').insert({
    inventory_id: s.inv.id, user_id: s.inv.user_id, source_doc_id: s.doc.id, fuel_type: s.proposal.fuelType, proposal_index: s.index,
    reading: readingOf(s.proposal as unknown as Record<string, unknown>), result: b.result, note, checked_by: staff.userId,
  })
  if (error) return fail(409, 'The spot-check was not recorded.')
  return { ok: true as const, result: b.result }
}
