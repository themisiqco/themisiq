// POST /api/account/marketing-consent: the dashboard's "Email updates" choice (LEAD1 L6, Oct 2026; design section 5:
// "the account page also shows the setting"). Signed in. { granted: true } records a new consent row with the wording
// shown on the dashboard; { granted: false } withdraws the active one. Reading the current choice needs no route: the
// owner may SELECT their own rows (M5 policy).
//
// AS THE USER: who is asking (lib/supabaseAuthed.ts). AS THE SERVICE ROLE: the write (marketing_consents is written by
// the service role only, and only withdrawn_at can change).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin'
import { ipFromHeaders } from '../../../../lib/rateLimit'
import { setAccountConsent } from '../../../../lib/consent/consentService'
import { CONSENT_COPY, type ConsentRow } from '../../../../lib/consent/marketing'

export async function POST(req: NextRequest) {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ ok: false, code: 'unauthenticated', message: CONSENT_COPY.settingsSignIn }, { status: 401 })
    console.error('[account/marketing-consent] auth failed:', err)
    return NextResponse.json({ ok: false, code: 'auth_failed', message: CONSENT_COPY.failed }, { status: 500 })
  }
  if (!authed.email) return NextResponse.json({ ok: false, code: 'no_email', message: CONSENT_COPY.failed }, { status: 400 })
  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const admin = getSupabaseAdmin()
  const userId = authed.userId
  const result = await setAccountConsent(body, {
    user: { id: userId, email: authed.email },
    ip: ipFromHeaders(req),
    userAgent: req.headers.get('user-agent'),
    listOwn: async () => {
      const { data } = await admin.from('marketing_consents').select('id, granted, created_at, withdrawn_at')
        .eq('user_id', userId).eq('purpose', 'updates').order('created_at', { ascending: false }).limit(20)
      return (data ?? []) as ConsentRow[]
    },
    insertConsent: async (row) => {
      const { data, error } = await admin.from('marketing_consents').insert(row).select('id').single()
      return error || !data ? { error: error?.message ?? 'no row returned' } : { id: data.id as string }
    },
    withdrawForUser: async () => {
      const { data, error } = await admin.from('marketing_consents').update({ withdrawn_at: new Date().toISOString() })
        .eq('user_id', userId).eq('purpose', 'updates').eq('granted', true).is('withdrawn_at', null).select('id')
      return error ? { error: error.message } : { updated: (data ?? []).length }
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
