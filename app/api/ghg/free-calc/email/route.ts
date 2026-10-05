// POST /api/ghg/free-calc/email — "Email me my results again" (LEAD1 L5, Oct 2026; design section 2). Signed in; own
// calculation only; to the session's verified address; rate-limited. The logic is lib/ghg/freeCalcService.ts
// emailResultsAgain; this file wires it to Supabase, the rate limiter and Resend.
//   AS THE USER (lib/supabaseAuthed.ts, RLS applies): the saved row, so another account's id reads as not found.
//   AS THE SERVICE ROLE: profiles.full_name, for the greeting.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../../lib/supabaseAuthed'
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { checkAndRecordRateLimit, ipFromHeaders } from '../../../../../lib/rateLimit'
import { emailResultsAgain, RESEND_RESULTS_LIMIT } from '../../../../../lib/ghg/freeCalcService'
import { RESULTS_EMAIL_COLUMNS, type SavedInventoryRow } from '../../../../../lib/ghg/resultsEmail'
import { sendResultsEmail } from '../../../../../lib/ghg/resultsEmailSend'
import { SITE_ORIGIN } from '../../../../../lib/siteOrigin'
import { activeConsent, type ConsentRow } from '../../../../../lib/consent/marketing'

const HOUR = 60 * 60 * 1000

export async function POST(req: NextRequest) {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ ok: false, code: 'unauthenticated', message: 'Sign in to email your results.' }, { status: 401 })
    console.error('[free-calc/email] auth failed:', err)
    return NextResponse.json({ ok: false, code: 'auth_failed' }, { status: 500 })
  }
  if (!authed.email) return NextResponse.json({ ok: false, code: 'no_email', message: 'This account has no email address to send to.' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const db = authed.supabase
  const userId = authed.userId
  const ip = ipFromHeaders(req)

  const result = await emailResultsAgain(body, {
    user: { id: userId, email: authed.email },
    // Per account (by its address) and per IP, in the same table and helper as /pending.
    rateLimitOk: async () => (await checkAndRecordRateLimit({
      bucket: 'results-email', ip, email: authed.email!.toLowerCase(), ipLimit: 10, emailLimit: RESEND_RESULTS_LIMIT, windowMs: HOUR,
    })).ok,
    readSavedRow: async (id) => {
      const { data, error } = await db.from('ghg_inventories').select(RESULTS_EMAIL_COLUMNS).eq('id', id).maybeSingle()
      if (error) console.error('[free-calc/email] row read failed:', error.message)
      return (data as SavedInventoryRow | null) ?? null
    },
    profileFullName: async () => {
      const { data } = await getSupabaseAdmin().from('profiles').select('full_name').eq('id', userId).maybeSingle()
      return (data?.full_name as string | null | undefined) ?? null
    },
    sendResults: (to, email) => sendResultsEmail(to, email),
    siteUrl: SITE_ORIGIN,
    // L6: the unsubscribe link goes only to an account whose marketing consent is active.
    activeConsentId: async () => {
      const { data, error } = await getSupabaseAdmin().from('marketing_consents').select('id, granted, created_at, withdrawn_at')
        .eq('user_id', userId).eq('purpose', 'updates').order('created_at', { ascending: false }).limit(20)
      if (error) { console.error('[free-calc/email] consent read failed:', error.message); return null }
      return activeConsent((data ?? []) as ConsentRow[])?.id ?? null
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
