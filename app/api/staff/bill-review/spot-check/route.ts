// app/api/staff/bill-review/spot-check/route.ts
// BR8b: record a spot-check (bill_reader; logs record_spot_check first). Who and when come from the session and the server.
import { staffRoute, bodyOf } from '../../../../../lib/staff/staffRoute'
import { recordSpotCheck } from '../../../../../lib/staff/spotChecks'

export const POST = staffRoute('bill_reader', async (staff, req) => recordSpotCheck(staff, await bodyOf(req)))
