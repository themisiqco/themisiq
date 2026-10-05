// POST /api/unsubscribe: withdraws marketing consent from a signed link (LEAD1 L6, Oct 2026; design section 5). The
// logic is lib/consent/consentService.ts unsubscribe; the token is lib/consent/unsubscribeToken.ts.
//
// TWO CALLERS, ONE ROUTE:
//   - a mail client's one-click unsubscribe (RFC 8058): POST to the List-Unsubscribe URL, ?token= in the query, body
//     "List-Unsubscribe=One-Click" as a form. Withdraws. Unchanged since L6 was first built;
//   - the /unsubscribe page, which posts JSON. { token, action: 'check' } (sent on load) is READ ONLY: it answers with
//     the address, masked, and changes nothing. Only { token, action: 'unsubscribe' }, sent by the page's button,
//     withdraws. A JSON request with no action is a check.
// ⚠️ NOTHING THAT A LINK SCANNER DOES WITHDRAWS. There is no GET handler (scanners fetch every URL), and the page does
// not withdraw on load (scanners that render pages run their script; L6 amendment, 5 Oct 2026). The one-click POST is
// sent by mail clients only, by the standard, when the reader chooses Unsubscribe in the client.
//
// AS THE SERVICE ROLE: marketing_consents is written by the service role only, and it can only set withdrawn_at
// (docs/review/patches/L6-M5-marketing-consents.sql). Nothing is deleted.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin'
import { unsubscribe, checkUnsubscribe } from '../../../lib/consent/consentService'
import { verifyUnsubscribeToken } from '../../../lib/consent/unsubscribeToken'

/** An address as an exact, case-insensitive ilike pattern: % _ and \ escaped. */
const exactIlike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)

export async function POST(req: NextRequest) {
  const queryToken = req.nextUrl.searchParams.get('token')
  let token: unknown = queryToken
  let action: 'check' | 'unsubscribe' = queryToken ? 'unsubscribe' : 'check'
  if (!queryToken && (req.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      const b = (await req.json()) as { token?: unknown; action?: unknown }
      token = b.token
      action = b.action === 'unsubscribe' ? 'unsubscribe' : 'check'
    } catch { token = null }
  }
  const admin = getSupabaseAdmin()
  const deps = {
    verify: (t: unknown) => verifyUnsubscribeToken(t),
    getConsent: async (id: string) => {
      const { data } = await admin.from('marketing_consents').select('id, email').eq('id', id).maybeSingle()
      return (data as { id: string; email: string } | null) ?? null
    },
    withdrawForEmail: async (email: string) => {
      const { data, error } = await admin.from('marketing_consents')
        .update({ withdrawn_at: new Date().toISOString() })
        .ilike('email', exactIlike(email)).eq('purpose', 'updates').eq('granted', true).is('withdrawn_at', null)
        .select('id')
      return error ? { error: error.message } : { updated: (data ?? []).length }
    },
  }
  const result = action === 'unsubscribe' ? await unsubscribe(token, deps) : await checkUnsubscribe(token, deps)
  return NextResponse.json(result.body, { status: result.status })
}
