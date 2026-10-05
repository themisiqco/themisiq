// POST /api/ghg/free-calc/pending — keeps a visitor's calculation for 24 hours, by email, while they confirm the
// address with a sign-in code (LEAD1 L3, Oct 2026; design 1.6). No session. The logic is lib/ghg/freeCalcService.ts
// holdFreeCalc; this file wires it to the rate limiter, Cloudflare and the service-role client (free_calc_pending is
// service-role only: RLS on, no policy, docs/review/patches/L3-M4-free-calc-pending.sql).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { checkAndRecordRateLimit, ipFromHeaders } from '../../../../../lib/rateLimit'
import { verifyTurnstile } from '../../../../../lib/turnstileVerify'
import { holdFreeCalc } from '../../../../../lib/ghg/freeCalcService'

const HOUR = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, code: 'bad_request' }, { status: 400 }) }
  const ip = ipFromHeaders(req)

  const result = await holdFreeCalc(body, {
    ip,
    userAgent: req.headers.get('user-agent'),
    now: new Date(),
    // Design section 6: 5 an hour per IP, 3 a day per address.
    rateLimitOk: async (kind, key) => {
      const r = kind === 'ip'
        ? await checkAndRecordRateLimit({ bucket: 'free-calc-ip', ip: key, email: null, ipLimit: 5, emailLimit: 1_000_000, windowMs: HOUR })
        : await checkAndRecordRateLimit({ bucket: 'free-calc-email', ip: null, email: key, ipLimit: 1_000_000, emailLimit: 3, windowMs: 24 * HOUR })
      return r.ok
    },
    verifyCaptcha: (token, remoteIp) => verifyTurnstile(token, remoteIp, { where: 'free-calc/pending' }),
    insertPending: async (row) => {
      const { data, error } = await getSupabaseAdmin().from('free_calc_pending').insert(row).select('id').single()
      return error || !data ? { error: error?.message ?? 'no row returned' } : { id: data.id as string }
    },
    purgeExpired: async () => {
      const { error } = await getSupabaseAdmin().from('free_calc_pending').delete().lt('expires_at', new Date().toISOString())
      if (error) throw new Error(error.message)
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
