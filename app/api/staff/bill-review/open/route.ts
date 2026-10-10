// app/api/staff/bill-review/open/route.ts
// BR8: open one bill (bill_reader; logs view_document before a 300 s signed URL). The body names a bill_review_documents
// row id only: the path signed is the row's, checked against the owner and the saved inventory (SEC-01).
import { staffRoute, bodyOf } from '../../../../../lib/staff/staffRoute'
import { openBill } from '../../../../../lib/staff/billReviewQueue'

export const POST = staffRoute('bill_reader', async (staff, req) => openBill(staff, (await bodyOf(req)).documentId))
