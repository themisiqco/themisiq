import { NextRequest, NextResponse } from 'next/server'

// Quote-request capture for /order carts that exceed the card threshold (>$10k) or are
// GHG Advisory. Email-only — NO payment, NO DB table. Clones the /api/assessment/submit
// Resend pattern (same env vars, same fetch helper): notify our monitor address so we can
// follow up with an invoice, and send the prospect a brief confirmation.

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL     = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'
const MONITOR_EMAIL  = process.env.RESEND_MONITOR_EMAIL!

// Same Resend fetch helper the assessment route uses (it isn't exported there — replicate).
const sendEmail = async (to: string, subject: string, html: string, text?: string) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ThemisIQ <${FROM_EMAIL}>`, to: [to], reply_to: 'hello@themisiq.co', subject, html, ...(text ? { text } : {}) }),
  })
  return res.json()
}

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as Record<string, string>)[c])

export async function POST(req: NextRequest) {
  try {
    const { contact, order } = await req.json()

    // Validate like the assessment route: name + a plausible email, else 400.
    if (!contact?.name?.trim() || !contact?.email || !String(contact.email).includes('@')) {
      return NextResponse.json({ error: 'Name and a valid email are required.' }, { status: 400 })
    }

    const date    = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    const name    = esc(contact.name)
    const email   = esc(contact.email)
    const company = esc(contact.company || '—')
    const phone   = contact.phone ? esc(contact.phone) : '—'
    const modules = Array.isArray(order?.modules) && order.modules.length ? esc(order.modules.join(', ')) : '—'
    const tier    = esc(order?.tier || '—')
    const total   = typeof order?.totalUSD === 'number' && order.totalUSD > 0 ? `$${order.totalUSD.toLocaleString()}` : 'Custom / Advisory'
    const ref     = order?.ref ? esc(order.ref) : null

    // ── Internal notification (the one we act on) ──────────────────────────────
    const notifyHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8f7f5;padding:24px;">
<div style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e7e4;">
  <div style="background:#0d0d0d;padding:16px 20px;display:flex;justify-content:space-between;">
    <span style="color:#fff;font-weight:700;font-size:14px;">ThemisIQ · Quote request</span>
    <span style="font-size:12px;color:rgba(255,255,255,0.4);">${date}</span>
  </div>
  <div style="padding:20px;">
    <table width="100%" style="margin-bottom:16px;">
      <tr><td width="140" style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Name</td><td style="font-size:12px;color:#0d0d0d;font-weight:600;">${name}</td></tr>
      <tr><td style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Company</td><td style="font-size:12px;color:#0d0d0d;">${company}</td></tr>
      <tr><td style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Email</td><td style="font-size:12px;color:#7425e3;">${email}</td></tr>
      <tr><td style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Phone</td><td style="font-size:12px;color:#0d0d0d;">${phone}</td></tr>
    </table>
    <div style="background:#EDE9FE;border-radius:6px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;color:#7425e3;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Requested configuration</div>
      <table width="100%">
        <tr><td width="120" style="font-size:12px;color:#888;padding:3px 0;">Modules</td><td style="font-size:12px;color:#0d0d0d;font-weight:600;">${modules}</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:3px 0;">GHG tier</td><td style="font-size:12px;color:#0d0d0d;">${tier}</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:3px 0;">Est. total</td><td style="font-size:12px;color:#0d0d0d;font-weight:600;">${total}</td></tr>
        ${ref ? `<tr><td style="font-size:12px;color:#888;padding:3px 0;">Referral (deal)</td><td style="font-size:12px;color:#0d0d0d;">${ref}</td></tr>` : ''}
      </table>
    </div>
  </div>
</div>
</body></html>`

    await sendEmail(
      MONITOR_EMAIL,
      `Quote request — ${company}`,
      notifyHtml,
      `Quote request from ${contact.name} (${contact.email}) · ${company} · modules: ${modules} · tier: ${tier} · total: ${total}${ref ? ` · ref: ${ref}` : ''}`,
    )

    // ── Confirmation to the prospect (mirror assessment route emailing the lead) ──
    const confirmHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7f5;"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td style="background:#0d0d0d;padding:24px 32px;"><span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">ThemisIQ</span></td></tr>
  <tr><td style="background:#fff;padding:32px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#0d0d0d;margin-bottom:12px;">Thanks — we've received your request.</div>
    <div style="font-size:14px;color:#555553;line-height:1.7;margin-bottom:16px;">Hi ${name}, thank you for your interest in ThemisIQ. Our team will prepare a quote for your selected configuration (${modules}) and follow up shortly at this address.</div>
    <div style="font-size:13px;color:#888784;line-height:1.7;">If it's urgent, reply to this email or reach us at hello@themisiq.co.</div>
  </td></tr>
  <tr><td style="background:#0d0d0d;padding:18px 32px;"><div style="font-size:11px;color:rgba(255,255,255,0.3);">ThemisIQ · www.themisiq.co · hello@themisiq.co</div></td></tr>
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:3px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
</td></tr></table>
</body></html>`

    await sendEmail(
      contact.email,
      'We received your ThemisIQ quote request',
      confirmHtml,
      `Thanks — we received your request and will prepare a quote for ${modules}, following up shortly at ${contact.email}.`,
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Quote request error:', error)
    return NextResponse.json({ error: 'Failed to send request.' }, { status: 500 })
  }
}
