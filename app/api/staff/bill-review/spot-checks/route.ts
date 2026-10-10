// app/api/staff/bill-review/spot-checks/route.ts
// BR8b: the spot-check sample (bill_reader; logs view_spot_checks). See lib/staff/spotChecks.ts.
import { staffRoute } from '../../../../../lib/staff/staffRoute'
import { sampleSpotChecks } from '../../../../../lib/staff/spotChecks'

export const GET = staffRoute('bill_reader', staff => sampleSpotChecks(staff))
