import { NextRequest, NextResponse } from 'next/server'
import { checkAndRecordRateLimit, ipFromHeaders } from '../../../../lib/rateLimit'
import { createDraftInvoiceForOrder } from '../../../../lib/order/invoice'
import type { Tier } from '../../../../lib/pricing'
import { INK_MUTED } from '@/lib/brand'

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
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
    const { contact, order } = (body ?? {}) as { contact?: Record<string, unknown>; order?: Record<string, unknown> }

    // Honeypot: bots fill the hidden field; real users leave it empty. Silently accept + drop
    // (return ok so the bot believes it succeeded, but send nothing and record nothing).
    if (contact?.hp && String(contact.hp).trim()) {
      return NextResponse.json({ ok: true })
    }

    // ── Validate + harden: required fields, email format, length caps ──────────
    const vName    = String(contact?.name ?? '').trim()
    const vEmail   = String(contact?.email ?? '').trim().toLowerCase()
    const vCompany = String(contact?.company ?? '').trim()
    const vPhone   = contact?.phone ? String(contact.phone).trim() : ''
    if (!vName || !vEmail || !vCompany) {
      return NextResponse.json({ error: 'Name, email, and company are required.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(vEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (vName.length > 200 || vEmail.length > 320 || vCompany.length > 200 || vPhone.length > 50) {
      return NextResponse.json({ error: 'One or more fields are too long.' }, { status: 400 })
    }
    const vModules = Array.isArray(order?.modules) ? (order.modules as unknown[]).slice(0, 20).map(m => String(m).slice(0, 50)) : []
    const vTier    = order?.tier ? String(order.tier).slice(0, 30) : ''
    const vRef     = order?.ref ? String(order.ref).slice(0, 200) : ''
    const tierParam: Tier | undefined =
      vTier === 'starter' || vTier === 'professional' || vTier === 'advisory' ? vTier : undefined

    // ── Rate limit (Supabase-backed; per IP + per email). 429 when exceeded ────
    const ip = ipFromHeaders(req)
    const rl = await checkAndRecordRateLimit({ bucket: 'order-quote-request', ip, email: vEmail, ipLimit: 8, emailLimit: 3, windowMs: 60 * 60 * 1000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later, or email hello@themisiq.co.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const date    = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    const name    = esc(vName)
    const email   = esc(vEmail)
    const company = esc(vCompany || '—')
    const phone   = vPhone ? esc(vPhone) : '—'
    const modules = vModules.length ? esc(vModules.join(', ')) : '—'
    const tier    = esc(vTier || '—')
    const total   = typeof order?.totalUSD === 'number' && (order.totalUSD as number) > 0 ? `$${(order.totalUSD as number).toLocaleString()}` : 'Custom / Advisory'
    const ref     = vRef ? esc(vRef) : null

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
      `Quote request from ${vName} (${vEmail}) · ${company} · modules: ${modules} · tier: ${tier} · total: ${total}${ref ? ` · ref: ${ref}` : ''}`,
    )

    // ── Confirmation to the prospect (mirror assessment route emailing the lead) ──
    const confirmHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7f5;"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
  <tr><td style="background:#0d0d0d;padding:24px 32px;"><span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">ThemisIQ</span></td></tr>
  <tr><td style="background:#fff;padding:32px;">
    <!-- Georgia here is deliberate, not a missed sweep: this is email HTML. A mail client cannot resolve var(--font-display), and web fonts do not load reliably in mail, so Literata would silently fall back anyway. Georgia is web-safe and is what every recipient actually sees. See app/components/headingStyles.ts. -->
    <div style="font-family:Georgia,serif;font-size:22px;color:#0d0d0d;margin-bottom:12px;">Thanks — we've received your request.</div>
    <div style="font-size:14px;color:#555553;line-height:1.7;margin-bottom:16px;">Hi ${name}, thank you for your interest in ThemisIQ. Our team will prepare a quote for your selected configuration (${modules}) and follow up shortly at this address.</div>
    <div style="font-size:13px;color:${INK_MUTED};line-height:1.7;">If it's urgent, reply to this email or reach us at hello@themisiq.co.</div>
  </td></tr>
  <tr><td style="background:#0d0d0d;padding:18px 32px;"><div style="font-size:11px;color:rgba(255,255,255,0.3);">ThemisIQ · www.themisiq.co · hello@themisiq.co</div></td></tr>
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:3px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
</table>
</td></tr></table>
</body></html>`

    await sendEmail(
      vEmail,
      'We received your ThemisIQ quote request',
      confirmHtml,
      `Thanks — we received your request and will prepare a quote for ${modules}, following up shortly at ${vEmail}.`,
    )

    // ── DRAFT-HOLD invoice (invoice-eligible path only) ────────────────────────
    // The prospect has ALREADY been confirmed above. This step auto-creates a DRAFT invoice
    // (I2: server-priced, metadata.{user_id,entitlements}, idempotent, auto_advance:false — nothing
    // sends) and notifies the monitor to review-and-send from Stripe with one click. It is wrapped so
    // that NO invoice-side fault can turn the prospect's submission into a visible failure, and it
    // NEVER finalizes/sends. Advisory & card-eligible are excluded by the helper's own guards.
    try {
      const inv = await createDraftInvoiceForOrder({ email: vEmail, modules: vModules, tier: tierParam, ref: vRef || undefined })
      if (inv.ok) {
        const link = `https://dashboard.stripe.com/invoices/${inv.invoiceId}`
        await sendEmail(
          MONITOR_EMAIL,
          `📝 Draft invoice ready — ${company} · $${inv.amount.toLocaleString()}`,
          `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8f7f5;padding:24px;">
<div style="max-width:560px;background:#fff;border-radius:8px;border:1px solid #e8e7e4;overflow:hidden;">
  <div style="background:#0d0d0d;padding:16px 20px;color:#fff;font-weight:700;font-size:14px;">ThemisIQ · Draft invoice — review &amp; send</div>
  <div style="padding:20px;">
    <table width="100%" style="margin-bottom:14px;">
      <tr><td width="120" style="font-size:12px;color:#888;padding:3px 0;">Customer</td><td style="font-size:12px;color:#0d0d0d;font-weight:600;">${name} · ${company}</td></tr>
      <tr><td style="font-size:12px;color:#888;padding:3px 0;">Email</td><td style="font-size:12px;color:#7425e3;">${email}</td></tr>
      <tr><td style="font-size:12px;color:#888;padding:3px 0;">Modules</td><td style="font-size:12px;color:#0d0d0d;">${modules}</td></tr>
      <tr><td style="font-size:12px;color:#888;padding:3px 0;">Amount</td><td style="font-size:12px;color:#0d0d0d;font-weight:600;">$${inv.amount.toLocaleString()}</td></tr>
      <tr><td style="font-size:12px;color:#888;padding:3px 0;">Invoice</td><td style="font-size:12px;color:#0d0d0d;">${esc(inv.invoiceId)}</td></tr>
      ${ref ? `<tr><td style="font-size:12px;color:#888;padding:3px 0;">Referral</td><td style="font-size:12px;color:#0d0d0d;">${ref}</td></tr>` : ''}
    </table>
    <div style="background:#EDE9FE;border-radius:6px;padding:12px 14px;font-size:12px;color:#555;line-height:1.6;margin-bottom:14px;">
      A <strong>draft</strong> invoice has been created (nothing sent). Review it in Stripe and click <strong>Send</strong> to bill the customer. On payment, their modules unlock automatically.
    </div>
    <a href="${link}" style="display:inline-block;font-size:13px;font-weight:600;color:#0d0d0d;background:linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e);padding:10px 22px;border-radius:8px;text-decoration:none;">Review &amp; send in Stripe →</a>
  </div>
</div>
</body></html>`,
          `Draft invoice created — ${vName} (${vEmail}) · ${company} · $${inv.amount.toLocaleString()} · invoice ${inv.invoiceId}. Review & send: ${link}`,
        )
      } else if (inv.reason === 'requires_quote') {
        // Advisory — not auto-priced. Human builds a custom quote in Stripe.
        await sendEmail(
          MONITOR_EMAIL,
          `Manual quote needed — ${company}`,
          `<p style="font-family:sans-serif;font-size:13px;color:#0d0d0d;">Manual quote needed for <strong>${name}</strong> (${email}) · ${company} · ${modules}.<br>Reason: ${esc(inv.message)}<br>Build a custom quote/invoice in Stripe manually.</p>`,
          `Manual quote needed for ${vName} (${vEmail}) · ${company} · ${modules}. ${inv.message}`,
        )
      } else if (inv.reason === 'card_eligible') {
        // Defensive: a ≤$10k order shouldn't reach the quote form. Do NOT invoice.
        console.warn(`[quote-request] card-eligible order reached quote path for ${vEmail}; no invoice created.`)
      } else {
        // empty / error — invoice NOT created. Alert the monitor to handle it manually.
        await sendEmail(
          MONITOR_EMAIL,
          `⚠ Invoice creation FAILED — ${company}`,
          `<p style="font-family:sans-serif;font-size:13px;color:#0d0d0d;">Automatic draft-invoice creation FAILED for <strong>${name}</strong> (${email}) · ${company} · ${modules}.<br>Reason: ${esc(inv.reason)} — ${esc(inv.message)}<br><strong>Create the invoice manually in Stripe.</strong> The prospect was still confirmed normally.</p>`,
          `Invoice creation FAILED for ${vName} (${vEmail}) · ${company} · ${modules}. Reason: ${inv.reason} — ${inv.message}. Create manually.`,
        )
      }
    } catch (invErr) {
      // The helper returns structured results (shouldn't throw), but be defensive: an invoice-side
      // fault must NEVER surface as a failed submission. Prospect already confirmed above.
      console.error('[quote-request] invoice step error (prospect already confirmed):', invErr)
      try {
        await sendEmail(
          MONITOR_EMAIL,
          `⚠ Invoice step error — ${company}`,
          `<p style="font-family:sans-serif;font-size:13px;color:#0d0d0d;">The invoice step threw for <strong>${name}</strong> (${email}) · ${company}. Create the invoice manually in Stripe. The prospect was confirmed normally.</p>`,
          `Invoice step threw for ${vName} (${vEmail}) · ${company}. Create manually.`,
        )
      } catch { /* monitor alert is best-effort */ }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Quote request error:', error)
    return NextResponse.json({ error: 'Failed to send request.' }, { status: 500 })
  }
}
