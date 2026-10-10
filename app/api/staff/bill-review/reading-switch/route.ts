// app/api/staff/bill-review/reading-switch/route.ts
// BR8 (Q1): change an inventory's reading on the customer's request. bill_review_lead only.
//   GET ?inventoryId=  the confirmation screen's facts (logs view_reading_switch)
//   POST {inventoryId, reading}  the change (logs set_reading first; the lead is stamped as set_by)
import { staffRoute, bodyOf } from '../../../../../lib/staff/staffRoute'
import { readingSwitchView, setReading } from '../../../../../lib/staff/billReviewQueue'

export const GET = staffRoute('bill_review_lead', async (staff, req) => readingSwitchView(staff, req.nextUrl.searchParams.get('inventoryId')))
export const POST = staffRoute('bill_review_lead', async (staff, req) => { const b = await bodyOf(req); return setReading(staff, b.inventoryId, b.reading) })
