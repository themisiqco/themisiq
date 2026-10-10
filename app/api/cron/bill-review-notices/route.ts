// app/api/cron/bill-review-notices/route.ts
//
// BR7: THE DAILY BILL REVIEW EMAIL JOB. Called by Vercel Cron once a day at 13:00 UTC (vercel.json), which is 08:00 in
// Toronto in winter and 09:00 in summer: the morning after a missed date (Q7). It enqueues the overdue emails for
// Toronto's date, any complete batch whose ready email was not enqueued, and retries every unsent email up to 5
// attempts (lib/billReview/notices.ts). Once only is the database's (20261016_bill_review_notices.sql), so a second
// call on the same day sends nothing twice.
//
// AUTH: Vercel sends "Authorization: Bearer {CRON_SECRET}" when the project has a CRON_SECRET variable. Nothing else
// is accepted. With no CRON_SECRET set the route refuses (503), so it can never run open.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase'
import { runDailyNotices } from '../../../../lib/billReview/notices'
import { torontoParts } from '../../../../lib/billReview/businessDays'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/bill-review-notices] refused: CRON_SECRET is not set')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const today = torontoParts(new Date()).date
  const result = await runDailyNotices(createServerClient(), today)
  console.log('[cron/bill-review-notices] ran', { today, ...result })
  return NextResponse.json({ today, ...result }, { status: result.errors.length > 0 ? 500 : 200 })
}
