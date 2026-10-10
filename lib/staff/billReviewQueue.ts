import 'server-only'
// lib/staff/billReviewQueue.ts
//
// BR8: THE SPECIALIST QUEUE, server side. Every function takes a Staff from requireStaffRole (lib/staff/access.ts) and
// writes its staff_access_log row FIRST: a failed log write throws StaffLogError, and nothing is read, served or saved.
// The service-role client is the staff member's (staff.admin).
//
//   loadQueue           view_queue            the bills with the team, overdue first then oldest first; the customer's
//                                             own actions from the saved inventory; failed emails (BR7)
//   openBill            view_document         a signed URL (signStaffDocument: logged first, 300 s) and the readings so far
//   saveReadings        save_reading          checked readings (lib/billReview/readingCheck.ts), the bill moved to read,
//                                             then notifyIfBatchComplete (Q8)
//   markUnreadable      mark_unreadable       the bill moved to unreadable with the note, then notifyIfBatchComplete
//   readingSwitchView   view_reading_switch   (lead) the confirmation screen's facts
//   setReading          set_reading           (lead) staff_set_bill_review_reading: the lead is stamped as set_by
//
// SEC-01: a document is signed only by the path its bill_review_documents row holds, only if that path is under the
// inventory owner's user id and is the path the saved inventory holds for that bill. Never a path from the browser:
// the routes take a row id.
// A bill the customer withdrew, deleted, or never saved (BR4's customerBillState, from the saved inventory) is shown
// but cannot be opened or read.

import type { SupabaseClient } from '@supabase/supabase-js'
import { logStaffAccess, signStaffDocument, type Staff } from './access'
import { customerBillState, type CustomerBillState } from '../billReview/billState'
import { checkReading, fuelsFor, type ReadingInput, type ReadingRowInsert } from '../billReview/readingCheck'
import { sortQueue, isOverdue } from '../billReview/queueOrder'
import { switchSentence } from '../billReview/switchWords'
import { notifyIfBatchComplete } from '../billReview/notices'
import { torontoParts } from '../billReview/businessDays'
import { yearLabel } from '../ghg/reportingYear'
import { docTypeLabel } from '../ghg/conciergeDocTypes'
import { readingOf } from '../ghg/billReviewReading'
import type { Location, LocationEvent } from '../ghg/engine'
import type { BillReviewReading } from '../pricing'

export type Refusal = { ok: false; status: 400 | 404 | 409 | 503; error: string }
type Row = {
  id: string; inventory_id: string; user_id: string; source_doc_id: string; file_path: string; file_name: string
  document_type: string; location_name: string | null; status: 'waiting' | 'read' | 'unreadable'; submitted_at: string
  expected_by: string | null; expected_by_refusal: string | null; read_at: string | null; unreadable_note: string | null
}
type Inv = { id: string; user_id: string; company_name: string | null; reporting_year: number; fiscal_year_end_month: number | null
  locations_data: Location[] | null; location_log: LocationEvent[] | null; bill_review_reading?: unknown }

const ROW_COLS = 'id, inventory_id, user_id, source_doc_id, file_path, file_name, document_type, location_name, status, submitted_at, expected_by, expected_by_refusal, read_at, unreadable_note'
const INV_COLS = 'id, user_id, company_name, reporting_year, fiscal_year_end_month, locations_data, location_log'

export const CUSTOMER_STATE_WORDS: Record<Exclude<CustomerBillState, 'on_inventory'>, string> = {
  withdrawn: 'Withdrawn by the customer. It cannot be read.',
  deleted: 'Deleted by the customer. It cannot be read.',
  not_on_inventory: 'Not on the saved inventory. It cannot be read.',
}

const today = () => torontoParts(new Date()).date
const fail = (status: Refusal['status'], error: string): Refusal => ({ ok: false, status, error })

export async function loadQueue(staff: Staff) {
  await logStaffAccess(staff, { action: 'view_queue' })
  const a = staff.admin
  const { data: rows, error } = await a.from('bill_review_documents').select(ROW_COLS).order('submitted_at', { ascending: true }).limit(1000)
  if (error || !rows) return fail(503, 'The queue could not be read.')
  const ids = [...new Set((rows as Row[]).map(r => r.inventory_id))]
  const { data: invs, error: iErr } = ids.length ? await a.from('ghg_inventories').select(INV_COLS).in('id', ids) : { data: [], error: null }
  if (iErr || !invs) return fail(503, 'The inventories could not be read.')
  const byId = new Map((invs as Inv[]).map(i => [i.id, i]))
  const now = today()
  const items = (rows as Row[]).map(r => {
    const inv = byId.get(r.inventory_id)
    const state: CustomerBillState = inv ? customerBillState(inv.locations_data ?? [], inv.location_log, r.source_doc_id) : 'not_on_inventory'
    return {
      id: r.id, inventoryId: r.inventory_id, status: r.status, submitted_at: r.submitted_at, expected_by: r.expected_by,
      overdue: r.status === 'waiting' && isOverdue(r, now),
      company: inv?.company_name ?? null,
      year: inv ? yearLabel(inv.reporting_year, inv.fiscal_year_end_month ?? 12).inText : null,
      site: r.location_name, fileName: r.file_name, documentType: docTypeLabel(r.document_type),
      customerState: state, readable: state === 'on_inventory' && r.status !== 'unreadable',
      stateWords: state === 'on_inventory' ? null : CUSTOMER_STATE_WORDS[state],
    }
  })
  const waiting = sortQueue(items.filter(i => i.status === 'waiting'), now)
  const done = items.filter(i => i.status !== 'waiting').sort((x, y) => y.submitted_at.localeCompare(x.submitted_at))
  const { data: notices } = await a.from('bill_review_notices').select('id, kind, inventory_id, attempts, last_error, last_attempt_at').eq('status', 'failed')
  const failedEmails = (notices ?? []).map(n => ({ ...n, company: byId.get(n.inventory_id as string)?.company_name ?? null }))
  return { ok: true as const, today: now, waiting, done, failedEmails }
}

/** The bill, its inventory, and the checks every action on it needs. */
async function billFor(admin: SupabaseClient, documentId: unknown): Promise<{ ok: true; row: Row; inv: Inv } | Refusal> {
  if (typeof documentId !== 'string' || !documentId) return fail(400, 'documentId is required.')
  const { data: row, error } = await admin.from('bill_review_documents').select(ROW_COLS).eq('id', documentId).maybeSingle()
  if (error) return fail(503, 'The bill could not be read.')
  if (!row) return fail(404, 'No such bill.')
  const { data: inv, error: iErr } = await admin.from('ghg_inventories').select(INV_COLS).eq('id', (row as Row).inventory_id).maybeSingle()
  if (iErr) return fail(503, 'The inventory could not be read.')
  if (!inv) return fail(404, 'The inventory is no longer held.')
  const r = row as Row, i = inv as Inv
  const state = customerBillState(i.locations_data ?? [], i.location_log, r.source_doc_id)
  if (state !== 'on_inventory') return fail(409, CUSTOMER_STATE_WORDS[state])
  // SEC-01: the owner's folder, and the path the saved inventory holds for this bill.
  const saved = (i.locations_data ?? []).flatMap(l => l.source_docs ?? []).find(d => d.id === r.source_doc_id)
  if (r.user_id !== i.user_id || !r.file_path.startsWith(`${i.user_id}/`) || saved?.file_path !== r.file_path) {
    console.warn('[staff/bill-review] path does not match the owner or the saved bill; refused', { documentId: r.id })
    return fail(409, 'This bill’s stored file does not match the inventory. It cannot be opened.')
  }
  return { ok: true, row: r, inv: i }
}

export async function openBill(staff: Staff, documentId: unknown) {
  const b = await billFor(staff.admin, documentId)
  if (!b.ok) return b
  const url = await signStaffDocument(staff, { path: b.row.file_path, inventoryId: b.row.inventory_id })
  const { data: readings } = await staff.admin.from('bill_review_readings')
    .select('id, fuel_type, raw_value, raw_unit, period_start, period_end, delivery_date, source_quote, notes, supersedes, read_at')
    .eq('bill_review_document_id', b.row.id).order('read_at', { ascending: true })
  return {
    ok: true as const, url,
    bill: { id: b.row.id, status: b.row.status, fileName: b.row.file_name, documentType: b.row.document_type, documentTypeLabel: docTypeLabel(b.row.document_type),
      site: b.row.location_name, company: b.inv.company_name, year: yearLabel(b.inv.reporting_year, b.inv.fiscal_year_end_month ?? 12).inText,
      expected_by: b.row.expected_by, fuels: fuelsFor(b.row.document_type) },
    readings: readings ?? [],
  }
}

export async function saveReadings(staff: Staff, documentId: unknown, inputs: unknown) {
  const b = await billFor(staff.admin, documentId)
  if (!b.ok) return b
  if (b.row.status === 'unreadable') return fail(409, 'This bill was marked as unreadable, so a reading cannot be added.')
  if (!Array.isArray(inputs) || inputs.length === 0) return fail(400, 'Add at least one reading.')
  const rows: ReadingRowInsert[] = []
  for (const [i, r] of (inputs as ReadingInput[]).entries()) {
    const c = checkReading(b.row.document_type, r ?? {})
    if (!c.ok) return fail(400, inputs.length > 1 ? `Reading ${i + 1}: ${c.error}` : c.error)
    rows.push(c.row)
  }
  await logStaffAccess(staff, { action: 'save_reading', documentRef: b.row.id, inventoryId: b.row.inventory_id })
  const { error } = await staff.admin.from('bill_review_readings').insert(rows.map(r => ({ ...r, bill_review_document_id: b.row.id, user_id: b.row.user_id, inventory_id: b.row.inventory_id, read_by: staff.userId })))
  if (error) return fail(409, 'The reading was not saved. A correction must replace a reading of this bill.')
  if (b.row.status === 'waiting') {
    const { error: mErr } = await staff.admin.from('bill_review_documents').update({ status: 'read', read_by: staff.userId }).eq('id', b.row.id)
    if (mErr) return fail(503, 'The reading was saved, but the bill was not marked as read. Try again.')
  }
  const notified = await notifyIfBatchComplete(staff.admin, b.row.inventory_id)
  return { ok: true as const, saved: rows.length, notified }
}

export async function markUnreadable(staff: Staff, documentId: unknown, note: unknown) {
  const b = await billFor(staff.admin, documentId)
  if (!b.ok) return b
  if (b.row.status !== 'waiting') return fail(409, b.row.status === 'read' ? 'This bill has a reading, so it cannot be marked as unreadable.' : 'This bill is already marked as unreadable.')
  const n = typeof note === 'string' ? note.trim() : ''
  if (!n) return fail(400, 'Say why the bill cannot be read. The customer sees this note.')
  if (n.length > 500) return fail(400, 'Keep the note to 500 characters.')
  await logStaffAccess(staff, { action: 'mark_unreadable', documentRef: b.row.id, inventoryId: b.row.inventory_id })
  const { error } = await staff.admin.from('bill_review_documents').update({ status: 'unreadable', read_by: staff.userId, unreadable_note: n }).eq('id', b.row.id)
  if (error) return fail(409, 'The bill was not marked as unreadable.')
  const notified = await notifyIfBatchComplete(staff.admin, b.row.inventory_id)
  return { ok: true as const, notified }
}

async function inventoryForSwitch(admin: SupabaseClient, inventoryId: unknown) {
  if (typeof inventoryId !== 'string' || !inventoryId) return fail(400, 'inventoryId is required.')
  const { data, error } = await admin.from('ghg_inventories').select(`${INV_COLS}, bill_review_reading`).eq('id', inventoryId).maybeSingle()
  if (error) return fail(503, 'The inventory could not be read.')
  if (!data) return fail(404, 'No such inventory.')
  return { ok: true as const, inv: data as Inv }
}
/** Bills the AI read: documents with a reading and no Bill Review mark. */
const readByAi = (inv: Inv) => (inv.locations_data ?? []).flatMap(l => l.source_docs ?? []).filter(d => (d.extracted?.length ?? 0) > 0 && !d.bill_review).length

export async function readingSwitchView(staff: Staff, inventoryId: unknown) {
  const r = await inventoryForSwitch(staff.admin, inventoryId)
  if (!r.ok) return r
  await logStaffAccess(staff, { action: 'view_reading_switch', inventoryId: r.inv.id })
  const now = readingOf(r.inv.bill_review_reading)
  const to: BillReviewReading = now === 'human' ? 'ai' : 'human'
  return { ok: true as const, inventoryId: r.inv.id, company: r.inv.company_name, year: yearLabel(r.inv.reporting_year, r.inv.fiscal_year_end_month ?? 12).inText,
    reading: now, to, readByAi: readByAi(r.inv), sentence: switchSentence(to, readByAi(r.inv)) }
}

export async function setReading(staff: Staff, inventoryId: unknown, reading: unknown) {
  if (reading !== 'ai' && reading !== 'human') return fail(400, 'The reading must be ai or human.')
  const r = await inventoryForSwitch(staff.admin, inventoryId)
  if (!r.ok) return r
  await logStaffAccess(staff, { action: 'set_reading', inventoryId: r.inv.id })
  const { data, error } = await staff.admin.rpc('staff_set_bill_review_reading', { p_inventory_id: r.inv.id, p_reading: reading, p_staff_user_id: staff.userId })
  if (error) return fail(409, `The reading was not changed: ${error.message}`)
  return { ok: true as const, reading, setAt: data as string | null }
}
