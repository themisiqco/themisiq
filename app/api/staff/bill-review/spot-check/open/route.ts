// app/api/staff/bill-review/spot-check/open/route.ts
// BR8b: open a sampled AI reading and its bill (bill_reader; logs view_ai_reading, then view_document before a 300 s URL).
import { staffRoute, bodyOf } from '../../../../../../lib/staff/staffRoute'
import { openSpotCheck } from '../../../../../../lib/staff/spotChecks'

export const POST = staffRoute('bill_reader', async (staff, req) => openSpotCheck(staff, await bodyOf(req)))
