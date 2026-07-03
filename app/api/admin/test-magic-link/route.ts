// app/api/admin/test-magic-link/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TEMPORARY TEST ENDPOINT — remove after verifying magic-link login. NOT part of the
// production flow. Admin-gated. It exists only to trigger the SAME magic-link generation +
// Resend email as sendInvoiceLoginLink (in the invoice.paid webhook), so we can verify the
// login flow in isolation without paying a live invoice. Delete this file once confirmed.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL     = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'
const SITE_URL       = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.themisiq.co'

// Same Resend fetch helper as the webhook / transactional routes.
async function sendEmail(to: string, subject: string, html: string, text?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ThemisIQ <${FROM_EMAIL}>`, to: [to], reply_to: 'hello@themisiq.co', subject, html, ...(text ? { text } : {}) }),
  })
  return res.json()
}

export async function POST(req: NextRequest) {
  try {
    // Admin gate — identical to app/api/admin/create-invoice/route.ts.
    const token = bearerFrom(req)
    const { email: callerEmail } = await getAuthedClient(token)
    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
      console.error('[test-magic-link] ADMIN_EMAIL is not set')
      return NextResponse.json({ error: 'Admin not configured.' }, { status: 500 })
    }
    if (!callerEmail || callerEmail.toLowerCase() !== adminEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string }
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // ── SAME magic-link generation as sendInvoiceLoginLink ─────────────────────
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=/dashboard` },
    })
    const actionLink = linkData?.properties?.action_link
    if (linkErr || !actionLink) {
      return NextResponse.json({ error: `Could not generate magic link: ${linkErr?.message ?? 'no action_link'}` }, { status: 500 })
    }

    // ── SAME branded "Your ThemisIQ access is ready — log in" email ────────────
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7f5;"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td style="background:#0d0d0d;padding:24px 32px;"><span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">ThemisIQ</span></td></tr>
  <tr><td style="background:#fff;padding:32px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#0d0d0d;margin-bottom:12px;">Your ThemisIQ access is ready.</div>
    <div style="font-size:14px;color:#555553;line-height:1.7;margin-bottom:20px;">Your payment is confirmed and your modules are unlocked. Click below to log in — no password needed.</div>
    <a href="${actionLink}" style="display:inline-block;font-size:14px;font-weight:600;color:#0d0d0d;background:linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e);padding:12px 26px;border-radius:8px;text-decoration:none;">Log in to ThemisIQ →</a>
    <div style="font-size:12px;color:#888784;line-height:1.7;margin-top:20px;">This link is single-use and expires shortly. If it has expired, use &ldquo;Forgot password&rdquo; on the login page. Questions? Reach us at hello@themisiq.co.</div>
  </td></tr>
  <tr><td style="background:#0d0d0d;padding:18px 32px;"><div style="font-size:11px;color:rgba(255,255,255,0.3);">ThemisIQ · www.themisiq.co · hello@themisiq.co</div></td></tr>
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:3px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
</td></tr></table>
</body></html>`

    await sendEmail(email, 'Your ThemisIQ access is ready — log in', html, `Your ThemisIQ access is ready. Log in: ${actionLink}`)

    return NextResponse.json({ ok: true, sentTo: email })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }
    console.error('[test-magic-link] error:', err)
    return NextResponse.json({ error: 'Could not send test magic link.' }, { status: 500 })
  }
}
