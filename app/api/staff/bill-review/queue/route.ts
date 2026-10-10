// app/api/staff/bill-review/queue/route.ts
// BR8: the specialist queue (bill_reader; logs view_queue). See lib/staff/billReviewQueue.ts.
import { staffRoute } from '../../../../../lib/staff/staffRoute'
import { loadQueue } from '../../../../../lib/staff/billReviewQueue'

export const GET = staffRoute('bill_reader', staff => loadQueue(staff))
