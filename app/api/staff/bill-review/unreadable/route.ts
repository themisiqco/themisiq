// app/api/staff/bill-review/unreadable/route.ts
// BR8: mark a bill as unreadable, with the note the customer reads (bill_reader; logs mark_unreadable first), then
// notifyIfBatchComplete (Q8).
import { staffRoute, bodyOf } from '../../../../../lib/staff/staffRoute'
import { markUnreadable } from '../../../../../lib/staff/billReviewQueue'

export const POST = staffRoute('bill_reader', async (staff, req) => { const b = await bodyOf(req); return markUnreadable(staff, b.documentId, b.note) })
