// app/api/bill-review/submit/route.ts
//
// BR4: A BILL UPLOADED TO A HUMAN-READ INVENTORY GOES TO THE BILL REVIEW TEAM. The wizard calls this once per upload
// (and again, harmlessly, for any bill whose earlier call did not land). It records the bill as waiting, with the date
// it is expected by, and returns that date. The bill is never sent to the AI: the extract route refuses any bill with
// this record (BR4 (a)).
//
//   401  no valid session
//   403  Bill Review not held; a path naming another user or inventory; an inventory the caller cannot read
//   400  a missing field, or a path in the old format
//   409  the inventory is AI-read; or the path is already recorded for another inventory or document
//   503  the plan, the reading or the record could not be read or written (fails closed)
//
// The checks on the path, the caller, the inventory and its reading are lib/ghg/billReviewGuard.ts, the copy the
// extract route uses. The record is written with the service role (customers hold SELECT only), after those checks.
// expected_by comes from lib/billReview/businessDays.ts on the server, never from the browser. If expectedBy refuses
// (a year with no holiday list), the bill is still recorded as waiting, with no date and the reason, never a guess.
// Idempotent: a second call for the same stored bill returns the record the first one wrote.
// Every refusal is logged with metadata only (status, reason, inventory id), never the path or the file name.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'
import { createServerClient } from '../../../../lib/supabase'
import { billReviewEntitlement, checkStoredBill } from '../../../../lib/ghg/billReviewGuard'
import { expectedBy } from '../../../../lib/billReview/businessDays'
import { notifyStaffNewBatch } from '../../../../lib/billReview/notices'

function refuse(status: number, reason: string, error: string, inventoryId: string | null): NextResponse {
  console.warn('[bill-review/submit] refused', { status, reason, inventoryId })
  return NextResponse.json({ error, reason }, { status })
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)

export async function POST(req: NextRequest) {
  let inventoryId: string | null = null
  try {
    const { supabase, userId } = await getAuthedClient(bearerFrom(req))

    const entitlement = await billReviewEntitlement(supabase)
    if (entitlement === 'error') return refuse(503, 'entitlement_unknown', 'We couldn’t confirm your plan just now. Please try again in a moment.', null)
    if (entitlement === 'none') return refuse(403, 'no_bill_review', 'Sending bills to our team is part of Bill Review.', null)

    let body: Record<string, unknown>
    try { body = await req.json() } catch { return refuse(400, 'bad_request', 'The request could not be read.', null) }
    inventoryId = str(body.inventoryId)
    const filePath = str(body.filePath)

    const guard = await checkStoredBill(supabase, userId, { filePath, inventoryId }, 'human')
    if (!guard.ok) return refuse(guard.status, guard.reason, guard.error, inventoryId)

    const sourceDocId = str(body.sourceDocId), fileName = str(body.fileName), documentType = str(body.documentType)
    if (!sourceDocId || !fileName || !documentType) return refuse(400, 'missing_field', 'sourceDocId, fileName and documentType are required.', inventoryId)

    const due = expectedBy(new Date())
    const row = {
      user_id: userId,
      inventory_id: inventoryId,
      source_doc_id: sourceDocId,
      file_path: filePath,
      file_name: fileName,
      document_type: documentType,
      location_id: str(body.locationId),
      location_name: str(body.locationName),
      expected_by: due.ok ? due.date : null,
      expected_by_refusal: due.ok ? null : due.reason === 'no_holiday_list' ? `no_holiday_list:${due.year}` : due.reason,
    }

    const admin = createServerClient()
    const { error: insErr } = await admin.from('bill_review_documents').upsert(row, { onConflict: 'file_path', ignoreDuplicates: true })
    if (insErr) return refuse(503, 'record_failed', 'The bill was not recorded for our team. Please try again.', inventoryId)
    const { data: rec, error: readErr } = await admin
      .from('bill_review_documents')
      .select('id, user_id, inventory_id, source_doc_id, status, expected_by, expected_by_refusal')
      .eq('file_path', filePath as string)
      .maybeSingle()
    if (readErr || !rec) return refuse(503, 'record_failed', 'The bill was not recorded for our team. Please try again.', inventoryId)
    // A retry finds the first record. One that names another inventory or document is not this bill's.
    if (rec.user_id !== userId || rec.inventory_id !== inventoryId || rec.source_doc_id !== sourceDocId) {
      return refuse(409, 'recorded_elsewhere', 'That stored bill is already recorded for another document.', inventoryId)
    }
    // Staff notifications (ruled 10 Oct 2026): a bill that starts a batch emails every bill_reader, once per batch. The
    // database decides (bill_review_enqueue_staff_new_batch); a repeat or a second bill of the batch sends nothing. An
    // email that fails is kept in the outbox for the daily retry, and never fails the submission.
    try { await notifyStaffNewBatch(admin, rec.id as string) } catch { console.error('[bill-review/submit] staff notice failed', { inventoryId }) }
    return NextResponse.json({ status: rec.status, expectedBy: rec.expected_by ?? null, expectedByRefusal: rec.expected_by_refusal ?? null })
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    console.error('[bill-review/submit] failed', { inventoryId })
    return NextResponse.json({ error: 'The bill was not recorded for our team. Please try again.' }, { status: 500 })
  }
}
