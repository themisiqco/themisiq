// app/api/staff/bill-review/read/route.ts
// BR8: save a bill's readings (bill_reader; logs save_reading first), then notifyIfBatchComplete (Q8).
import { staffRoute, bodyOf } from '../../../../../lib/staff/staffRoute'
import { saveReadings } from '../../../../../lib/staff/billReviewQueue'

export const POST = staffRoute('bill_reader', async (staff, req) => { const b = await bodyOf(req); return saveReadings(staff, b.documentId, b.readings) })
