// app/api/staff/bill-review/reading-switch/inventories/route.ts
// BR8 follow-up: the inventories a lead may change the reading of, ?q= by company or owner email (bill_review_lead;
// logs view_reading_switch). Owner emails are shown to staff only.
import { staffRoute } from '../../../../../../lib/staff/staffRoute'
import { switchInventories } from '../../../../../../lib/staff/billReviewQueue'

export const GET = staffRoute('bill_review_lead', async (staff, req) => switchInventories(staff, req.nextUrl.searchParams.get('q')))
