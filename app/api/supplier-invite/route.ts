import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'
import { BRAND, INK_MUTED } from '@/lib/brand'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'

const sendEmail = async (to: string, subject: string, html: string) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ThemisIQ <${FROM_EMAIL}>`, to, subject, html }),
  })
  return res.json()
}

// Buyer-entered free text reaches these templates (campaign name, buyer company).
// It comes from the database rather than the request body, but it is still
// user-authored, so escape it before it lands in HTML.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;')

const inviteEmailHtml = ({
  supplierName,
  contactName,
  buyerCompany,
  campaignName,
  deadline,
  portalUrl,
  template,
}: {
  supplierName: string
  contactName: string | null
  buyerCompany: string
  campaignName: string
  deadline: string | null
  portalUrl: string
  template: string
}) => {
  const templateLabels: Record<string, string> = {
    ecovadis: 'Sustainability Questionnaire',
    scope3: 'Scope 3 Emissions Assessment',
    modern_slavery: 'Modern Slavery Act Questionnaire',
    cs3d: 'CS3D Human Rights Due Diligence',
    custom: 'Sustainability Questionnaire',
  }
  const templateLabel = templateLabels[template] || 'Sustainability Questionnaire'
  const buyer = escapeHtml(buyerCompany)
  const campaignLabel = escapeHtml(campaignName)
  const greeting = contactName ? `Dear ${escapeHtml(contactName)},` : `Dear ${escapeHtml(supplierName)} team,`
  const deadlineText = deadline ? `<p style="margin:0 0 16px;color:#555553;">Please complete the questionnaire by <strong>${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:0.5px solid #e8e7e4;">
    
    <!-- Header -->
    <div style="background:#0d0d0d;padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <!-- Georgia here is deliberate, not a missed sweep: this is email HTML. A mail client cannot resolve var(--font-display), and web fonts do not load reliably in mail, so Literata would silently fall back anyway. Georgia is web-safe and is what every recipient actually sees. See app/components/headingStyles.ts. -->
        <div style="font-size:20px;font-weight:700;color:#fff;font-family:Georgia,serif;">ThemisIQ</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;text-transform:uppercase;letter-spacing:0.08em;">Supplier Portal</div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);">Sustainability Compliance</div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#0d0d0d;font-size:15px;">${greeting}</p>
      
      <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
        <strong style="color:#0d0d0d;">${buyer}</strong> has invited you to complete a sustainability questionnaire as part of their supply chain programme.
      </p>

      <!-- Campaign box -->
      <div style="background:#f8f7f5;border:0.5px solid #e8e7e4;border-radius:12px;padding:20px;margin:0 0 24px;">
        <div style="font-size:11px;font-weight:700;color:${INK_MUTED};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Campaign details</div>
        <div style="font-size:14px;font-weight:600;color:#0d0d0d;margin-bottom:4px;">${campaignLabel}</div>
        <div style="font-size:12px;color:${INK_MUTED};">${templateLabel}</div>
      </div>

      ${deadlineText}

      <p style="margin:0 0 24px;color:#555553;font-size:14px;line-height:1.6;">
        The questionnaire covers your company's environmental performance, labour practices, business ethics, and sustainable procurement. Your responses will be saved automatically — you can complete it in multiple sessions using the same link.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7425e3,#1fb1ff);color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
          Start questionnaire →
        </a>
      </div>

      <p style="margin:0 0 8px;color:${INK_MUTED};font-size:12px;line-height:1.6;">
        Or copy this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:11px;color:${BRAND};word-break:break-all;">${portalUrl}</p>

      <div style="border-top:0.5px solid #e8e7e4;padding-top:20px;">
        <p style="margin:0;color:${INK_MUTED};font-size:11px;line-height:1.6;">
          This invitation was sent on behalf of ${buyer} via ThemisIQ. If you have questions about this request, please contact ${buyer} directly. Your responses are stored securely and only shared with ${buyer}.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8f7f5;border-top:0.5px solid #e8e7e4;padding:16px 32px;text-align:center;">
      <div style="font-size:11px;color:${INK_MUTED};">Powered by <a href="https://www.themisiq.co" style="color:${BRAND};text-decoration:none;">ThemisIQ</a> · Sustainability Compliance Platform</div>
    </div>
  </div>
</body>
</html>`
}

const reminderEmailHtml = ({
  supplierName,
  contactName,
  buyerCompany,
  campaignName,
  deadline,
  portalUrl,
}: {
  supplierName: string
  contactName: string | null
  buyerCompany: string
  campaignName: string
  deadline: string | null
  portalUrl: string
}) => {
  const buyer = escapeHtml(buyerCompany)
  const campaignLabel = escapeHtml(campaignName)
  const greeting = contactName ? `Dear ${escapeHtml(contactName)},` : `Dear ${escapeHtml(supplierName)} team,`
  const deadlineText = deadline ? `<strong>The deadline is ${new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. ` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:0.5px solid #e8e7e4;">
    <div style="background:#0d0d0d;padding:24px 32px;">
      <!-- Georgia here is deliberate, not a missed sweep: this is email HTML. A mail client cannot resolve var(--font-display), and web fonts do not load reliably in mail, so Literata would silently fall back anyway. Georgia is web-safe and is what every recipient actually sees. See app/components/headingStyles.ts. -->
      <div style="font-size:20px;font-weight:700;color:#fff;font-family:Georgia,serif;">ThemisIQ</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;text-transform:uppercase;letter-spacing:0.08em;">Supplier Portal — Reminder</div>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#0d0d0d;font-size:15px;">${greeting}</p>
      <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
        This is a friendly reminder that <strong style="color:#0d0d0d;">${buyer}</strong> is still waiting for your response to the <strong>${campaignLabel}</strong> sustainability questionnaire.
      </p>
      <p style="margin:0 0 24px;color:#555553;font-size:14px;line-height:1.6;">
        ${deadlineText}Your previous responses have been saved — just click below to continue where you left off.
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7425e3,#1fb1ff);color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
          Continue questionnaire →
        </a>
      </div>
      <div style="border-top:0.5px solid #e8e7e4;padding-top:20px;">
        <p style="margin:0;color:${INK_MUTED};font-size:11px;line-height:1.6;">Powered by ThemisIQ · www.themisiq.co</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }
  const supabase = authed.supabase
  const userId = authed.userId
  const body = await req.json()
  // buyer_company is deliberately NOT read from the body — it is derived from the
  // campaign below, so a client cannot choose the name the email is sent under.
  const { supplier_id, type = 'invite' } = body

  if (!supplier_id) {
    return NextResponse.json({ error: 'Missing supplier_id' }, { status: 400 })
  }

  // Get supplier + campaign details
  const { data: cs, error: csError } = await supabase
    .from('campaign_suppliers')
    .select('*, supplier_campaigns(*)')
    .eq('id', supplier_id)
    .single()

  if (csError || !cs) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  }

  const campaign = cs.supplier_campaigns

  // RLS (suppliers_select_own) already blocks a cross-tenant supplier_id, so this
  // is belt-and-braces — but it keeps the ownership dependency visible in the
  // route, so switching to a service-role client cannot silently remove it.
  if (campaign.buyer_id !== userId) {
    return NextResponse.json({ error: 'Not your campaign' }, { status: 403 })
  }

  // Single source for the sender name across subject, invite body and reminder.
  const buyerCompany = campaign.buyer_company || campaign.name
  const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.themisiq.co'}/supplier/${cs.token}`

  // Not escaped: a subject is a header, not HTML.
  const subject = type === 'reminder'
    ? `Reminder: ${buyerCompany} — sustainability questionnaire`
    : `${buyerCompany} has invited you to complete a sustainability questionnaire`

  const html = type === 'reminder'
    ? reminderEmailHtml({
        supplierName: cs.supplier_name,
        contactName: cs.contact_name,
        buyerCompany,
        campaignName: campaign.name,
        deadline: campaign.deadline,
        portalUrl,
      })
    : inviteEmailHtml({
        supplierName: cs.supplier_name,
        contactName: cs.contact_name,
        buyerCompany,
        campaignName: campaign.name,
        deadline: campaign.deadline,
        portalUrl,
        template: campaign.questionnaire_template || 'ecovadis',
      })

  const emailResult = await sendEmail(cs.supplier_email, subject, html)

  if (emailResult.error) {
    return NextResponse.json({ error: emailResult.error }, { status: 500 })
  }

  // Update sent timestamp
  if (type === 'reminder') {
    await supabase.from('campaign_suppliers').update({ reminder_sent_at: new Date().toISOString() }).eq('id', supplier_id)
  }

  return NextResponse.json({ success: true, email_id: emailResult.id })
}
