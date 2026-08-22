import { NextRequest, NextResponse } from 'next/server'
import { disclaimerParas } from '../../../../lib/disclaimer'
// Derived here, NOT posted by the client. The client already sends `obligationId` on each entry, and
// an id is a small stable token; a ready-made href would put the /order-vs-/pricing branch in two
// places and let a cached page email a link nothing could audit. The route resolves label, href and
// price from the same accessors /assess renders, so the two cannot quote different figures.
import { OBLIGATIONS, obligationHref, obligationPrice, modulesLabel, priceLabel } from '../../../../lib/obligations'

const RESEND_API_KEY   = process.env.RESEND_API_KEY!
const FROM_EMAIL       = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'

// EVERY LINK IN AN EMAIL MUST BE ABSOLUTE. The hrefs lib/obligations.ts returns are relative, because
// the page renders them into its own document; dropped into an inbox they resolve against the mail
// client and go nowhere. This prefixes them. It also replaces the two hardcoded
// 'https://www.themisiq.co/...' that were inline below, so the host is stated once.
const SITE_URL = 'https://www.themisiq.co'
const MONITOR_EMAIL    = process.env.RESEND_MONITOR_EMAIL!

// The formal Important Notice is rendered in the lead-email footer as fine print.
// Text lives in lib/disclaimer.ts — one copy across every surface that carries it.

// Pre-rendered HTML for the email footer: an "Important Notice" heading followed
// by each paragraph as fine print.
const DISCLAIMER_HTML = `<p style="font-size:10px;font-weight:700;color:#888;letter-spacing:0.06em;text-transform:uppercase;line-height:1.6;margin:0 0 6px;">Important Notice</p>`
  + disclaimerParas('screening').map(par => `<p style="font-size:10px;color:#aaa;line-height:1.6;margin:0 0 6px;">${par}</p>`).join('')

const URGENCY_COLOR: Record<string, string> = {
  critical: '#B91C1C', high: '#ba7517', medium: '#0C447C', monitor: '#888784'
}
const URGENCY_BG: Record<string, string> = {
  critical: '#FCEBEB', high: '#FEF3E2', medium: '#E6F1FB', monitor: '#f8f7f5'
}
const URGENCY_TEXT: Record<string, string> = {
  critical: '#501313', high: '#633806', medium: '#0C447C', monitor: '#888784'
}

export async function POST(req: NextRequest) {
  try {
    const { lead, obligations, profile } = await req.json()

    if (!lead?.email || !lead.email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // ── LEAD FIELDS — company, first, last and role are OPTIONAL BY DESIGN ──────
    // The form requires an email and nothing else, deliberately, and that is not changing here: the
    // fix for a blank slot is a fallback, not a new required field. Only `email` is guaranteed, by
    // the guard directly above.
    //
    // `??` IS THE WRONG OPERATOR AND WILL NOT FIRE. An untouched input posts '' — present, defined,
    // and not null — so nullish coalescing passes it straight through. Every fallback below is `||`
    // over a TRIMMED value, because a space-only input is empty to a reader and '' is not the only
    // way to be blank.
    const val = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
    const leadFirst   = val(lead.first)
    const leadLast    = val(lead.last)
    const leadCompany = val(lead.company)
    const leadRole    = val(lead.role)
    const leadEmail   = val(lead.email)          // non-empty: the guard above requires an '@'
    const leadName    = [leadFirst, leadLast].filter(Boolean).join(' ')

    // CUSTOMER-FACING: the sentence has to read as English with nothing filled in. 'your company' is
    // a phrase; '[company]', '(not provided)' or an empty slot is a hole with a label in it, and a
    // customer reading one learns that the email was generated badly rather than that they skipped
    // a field. Never show an absence marker to the person whose absence it is.
    const theirCompany = leadCompany || 'your company'

    // INTERNAL ALERT: the same absence is INFORMATION — "this lead would not give a company" is
    // worth seeing, and a blank table cell reads as a rendering fault rather than a fact.
    const NOT_GIVEN = '— not given'

    // Subject lines must still identify the lead in a full inbox. Name and company are both
    // optional, so the last resort is the email address: the one field that cannot be empty here.
    const leadIdent = [leadName, leadCompany].filter(Boolean).join(' · ') || leadEmail

    const total    = obligations.length
    const critical = obligations.filter((o: any) => o.urgency === 'critical').length
    const high     = obligations.filter((o: any) => o.urgency === 'high').length
    const date     = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

    // ── BUILD OBLIGATION ROWS ──────────────────────────────────────
    // Grouped to MIRROR THE RESULTS PAGE. The two carry the same list and must not tell different
    // stories: the reader forwards the email to a board or a lawyer, and a regulatory duty sitting
    // in an undifferentiated list next to 'At your own pace' reads as equally optional.
    //
    // Rows are partitioned by `group`, which the client sends. An entry with NO group — an older
    // client, or a cached page mid-deploy — is NOT dropped: it falls through to a third bucket that
    // says the classification is missing rather than silently omitting a row from a compliance
    // email. Losing an obligation quietly is the one failure this table cannot have.
    const GROUP_HEADINGS: { key: string; title: string; sub: string }[] = [
      { key: 'regulatory', title: 'Regulatory / compliance', sub: 'Rules that apply to you, based on where you operate, your size and your sector.' },
      { key: 'market',     title: 'Market-driven',           sub: 'What your customers, investors and lenders are asking for — often because they have a reporting obligation of their own.' },
      { key: '__ungrouped', title: 'Not classified',          sub: 'These entries arrived without a group. They are listed so nothing is lost; check them against the online results.' },
    ]
    // MODULE CELL — a priced link where the entry maps, plain text where it does not.
    //
    // MEMBERSHIP IS GUARDED, not assumed. A cached page mid-deploy can post an id this build no
    // longer holds, and indexing OBLIGATIONS blindly would throw inside the row map and take the
    // whole email down — losing every obligation to save one cell. An unknown id falls back to
    // `ob.module` as plain text, which is exactly what an unmapped entry renders anyway, so the
    // failure mode is the ordinary one rather than a new one.
    const moduleCell = (ob: any): string => {
      const id = ob.obligationId
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(OBLIGATIONS, id)) return ob.module
      const known = id as keyof typeof OBLIGATIONS
      const label = modulesLabel(OBLIGATIONS[known].modules)
      // SITE_URL prefix: obligationHref is relative for the page's benefit and is dead in an inbox.
      return `<a href="${SITE_URL}${obligationHref(known)}" style="color:#7425e3;text-decoration:none;">${label} · ${priceLabel(obligationPrice(known))} →</a>`
    }
    const row = (ob: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8f7f5'}">
        <td style="padding:10px 14px;border-bottom:1px solid #e8e7e4;font-size:12px;font-weight:600;color:#0d0d0d;vertical-align:top;">
          ${ob.name}
          <div style="font-size:11px;font-weight:400;color:#888784;margin-top:2px;">${ob.jurisdiction}</div>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e7e4;vertical-align:top;">
          <span style="font-size:10px;font-weight:700;color:${URGENCY_TEXT[ob.urgency]};background:${URGENCY_BG[ob.urgency]};padding:3px 8px;border-radius:99px;white-space:nowrap;">${ob.urgency_label}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e7e4;font-size:12px;color:#555553;vertical-align:top;">${ob.timing}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e8e7e4;font-size:12px;color:#7425e3;font-weight:600;vertical-align:top;">${moduleCell(ob)}</td>
      </tr>`
    // 'Obligation', not 'Regulation'. This one headerRow is rendered above BOTH group tables, so
    // under Market-driven it sat directly over EcoVadis and 'Customer Supplier Questionnaire' —
    // neither of which is a regulation. A column header is a claim about every row beneath it.
    const headerRow = `
      <tr style="background:#f8f7f5;">
        <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#888784;letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid #e8e7e4;">Obligation</th>
        <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#888784;letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid #e8e7e4;">Priority</th>
        <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#888784;letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid #e8e7e4;">Timing</th>
        <th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:#888784;letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid #e8e7e4;">Module</th>
      </tr>`
    // ── QUALIFICATION PROFILE (internal alert only) ────────────────
    // The visitor's answers, already resolved to display labels by the client — this route does NOT
    // re-derive them, because the slider stores an index into a label table only the page holds and
    // a second copy here would drift the day an option is reworded.
    //
    // ABSENT IS NOT EMPTY. An older client, or a cached page mid-deploy, sends no `profile` at all;
    // that is a different fact from a visitor who answered nothing, and the alert says which rather
    // than rendering a blank block that reads as "this lead told us nothing".
    const profileRows = !Array.isArray(profile)
      ? `<div style="margin-top:16px;font-size:11px;color:#888;">Qualification profile not sent by the client — this submission predates the profile field, or the page was cached from an earlier deploy.</div>`
      : profile.length === 0
      ? `<div style="margin-top:16px;font-size:11px;color:#888;">Qualification profile sent, but empty — the visitor reached the email gate without a recorded answer.</div>`
      : `
    <div style="font-size:11px;font-weight:600;color:#888;letter-spacing:0.06em;text-transform:uppercase;margin:16px 0 6px;">What they told us</div>
    <table width="100%" style="border:1px solid #e8e7e4;border-radius:6px;overflow:hidden;">
      ${profile.map((p: any, i: number) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8f7f5'}"><td width="45%" style="padding:6px 10px;border-bottom:1px solid #e8e7e4;font-size:11px;color:#888;vertical-align:top;">${p.q}</td><td style="padding:6px 10px;border-bottom:1px solid #e8e7e4;font-size:11px;color:#0d0d0d;font-weight:600;vertical-align:top;">${p.a}</td></tr>`).join('')}
    </table>`

    const obligationRows = GROUP_HEADINGS.map(g => {
      const rows = g.key === '__ungrouped'
        ? obligations.filter((o: any) => o.group !== 'regulatory' && o.group !== 'market')
        : obligations.filter((o: any) => o.group === g.key)
      if (rows.length === 0) return ''
      return `
    <div style="font-size:13px;font-weight:600;color:#0d0d0d;font-family:Georgia,serif;margin:0 0 2px;">${g.title}</div>
    <div style="font-size:11px;color:#888784;line-height:1.55;margin-bottom:8px;">${g.sub}</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e8e7e4;border-radius:8px;overflow:hidden;margin-bottom:18px;">
      ${headerRow}
      ${rows.map(row).join('')}
    </table>`
    }).join('')

    // ── LEAD EMAIL HTML ────────────────────────────────────────────
    const leadHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your ThemisIQ Compliance Obligation Map</title></head>
<body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f7f5;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <!-- GRADIENT TOP -->
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>

  <!-- DARK HEADER -->
  <tr><td style="background:#0d0d0d;padding:24px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td><span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px;">ThemisIQ</span><div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;">COMPLIANCE INTELLIGENCE</div></td>
      <td align="right"><div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.07em;">Compliance Obligation Map</div><div style="font-size:11px;color:rgba(255,255,255,0.25);margin-top:2px;">${date}</div></td>
    </tr></table>
  </td></tr>

  <!-- HERO -->
  <tr><td style="background:#111;padding:28px 32px 24px;">
    <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.35);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Prepared for ${leadIdent}</div>
    <div style="font-size:22px;font-weight:400;color:#fff;line-height:1.25;font-family:Georgia,serif;margin-bottom:10px;">We identified <span style="font-style:italic;">${total} ${total === 1 ? 'obligation' : 'obligations'}</span> that apply to ${theirCompany}.</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.65;margin-bottom:20px;">${critical} ${critical === 1 ? 'requires' : 'require'} immediate action. ${high} ${high === 1 ? 'is' : 'are'} high priority. Review your full Compliance Obligation Map below.</div>
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:8px;"><span style="font-size:11px;font-weight:700;color:#B91C1C;background:#FCEBEB;padding:4px 12px;border-radius:99px;">${critical} immediate</span></td>
      <td style="padding-right:8px;"><span style="font-size:11px;font-weight:700;color:#633806;background:#FEF3E2;padding:4px 12px;border-radius:99px;">${high} high priority</span></td>
      <td><span style="font-size:11px;font-weight:700;color:#888784;background:rgba(255,255,255,0.08);padding:4px 12px;border-radius:99px;">${total - critical - high} monitor</span></td>
    </tr></table>
  </td></tr>

  <!-- WHITE BODY -->
  <tr><td style="background:#fff;padding:32px;">
    <div style="font-size:11px;font-weight:600;color:#888784;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">Your compliance obligations</div>
    ${obligationRows}

    <div style="height:1px;background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);margin:28px 0;"></div>

    <div style="font-size:11px;font-weight:600;color:#888784;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:16px;">Recommended next steps</div>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;"><tr>
      <td width="32" valign="top" style="padding-right:12px;"><div style="width:28px;height:28px;border-radius:50%;background:#0d0d0d;font-size:12px;font-weight:700;color:#fff;text-align:center;line-height:28px;">1</div></td>
      <td valign="top"><div style="font-size:13px;font-weight:600;color:#0d0d0d;margin-bottom:3px;">Review your full Compliance Obligation Map</div><div style="font-size:12px;color:#555553;line-height:1.6;">Each obligation above carries its timing and a recommended first action. Some are fixed dates, others apply from today or run on request. Start with the ones marked IMMEDIATE ACTION.</div></td>
    </tr></table>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;"><tr>
      <td width="32" valign="top" style="padding-right:12px;"><div style="width:28px;height:28px;border-radius:50%;background:#0d0d0d;font-size:12px;font-weight:700;color:#fff;text-align:center;line-height:28px;">2</div></td>
      <td valign="top"><div style="font-size:13px;font-weight:600;color:#0d0d0d;margin-bottom:3px;">Get started with ThemisIQ</div><div style="font-size:12px;color:#555553;line-height:1.6;">ThemisIQ can have your most urgent obligations addressed in days. Set up your account in minutes.</div></td>
    </tr></table>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;"><tr>
      <td width="32" valign="top" style="padding-right:12px;"><div style="width:28px;height:28px;border-radius:50%;background:#0d0d0d;font-size:12px;font-weight:700;color:#fff;text-align:center;line-height:28px;">3</div></td>
      <td valign="top"><div style="font-size:13px;font-weight:600;color:#0d0d0d;margin-bottom:3px;">Book a free 30-minute Advisory consultation</div><div style="font-size:12px;color:#555553;line-height:1.6;">A named ThemisIQ advisor will review your obligations, prioritise by risk and effort, and tell you exactly where to start.</div></td>
    </tr></table>

    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:10px;"><a href="${SITE_URL}/signup" style="display:inline-block;font-size:13px;font-weight:600;color:#0d0d0d;background:linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e);padding:11px 24px;border-radius:8px;text-decoration:none;">Sign Up Today</a></td>
          <td><a href="${SITE_URL}/advisory" style="display:inline-block;font-size:13px;font-weight:500;color:#0d0d0d;background:#fff;border:1px solid #e8e7e4;padding:11px 24px;border-radius:8px;text-decoration:none;">Book Free Consultation</a></td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0d0d0d;padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td><div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:3px;">ThemisIQ</div><div style="font-size:11px;color:rgba(255,255,255,0.3);">Compliance Intelligence for Sustainable Business</div><div style="font-size:11px;color:rgba(255,255,255,0.2);margin-top:4px;">www.themisiq.co · hello@themisiq.co</div></td>
      <td align="right" valign="top"><div style="font-size:11px;color:rgba(255,255,255,0.2);text-align:right;line-height:1.6;">You received this because you completed<br>the ThemisIQ Compliance Assessment.<br><a href="https://www.themisiq.co" style="color:rgba(255,255,255,0.25);">Unsubscribe</a></div></td>
    </tr></table>
  </td></tr>

  <!-- IMPORTANT NOTICE -->
  <tr><td style="background:#f8f7f5;padding:16px 32px;">
    ${DISCLAIMER_HTML}
  </td></tr>

  <!-- GRADIENT BOTTOM -->
  <tr><td style="background:linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e);height:3px;font-size:1px;line-height:1px;">&nbsp;</td></tr>

</table>
</td></tr></table>
</body></html>`

    // ── INTERNAL NOTIFICATION HTML ─────────────────────────────────
    const notifyHtml = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f8f7f5;padding:24px;">
<div style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e7e4;">
  <div style="background:#0d0d0d;padding:16px 20px;display:flex;justify-content:space-between;">
    <span style="color:#fff;font-weight:700;font-size:14px;">ThemisIQ · New Assessment Lead</span>
    <span style="font-size:12px;color:rgba(255,255,255,0.4);">${date}</span>
  </div>
  <div style="padding:20px;">
    <table width="100%" style="margin-bottom:16px;">
      <tr><td width="140" style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Name</td><td style="font-size:12px;color:#0d0d0d;font-weight:600;">${leadName || NOT_GIVEN}</td></tr>
      <tr><td style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Company</td><td style="font-size:12px;color:#0d0d0d;">${leadCompany || NOT_GIVEN}</td></tr>
      <tr><td style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Role</td><td style="font-size:12px;color:#0d0d0d;">${leadRole || NOT_GIVEN}</td></tr>
      <tr><td style="font-size:12px;color:#888;font-weight:600;padding:4px 0;">Email</td><td style="font-size:12px;color:#7425e3;">${leadEmail}</td></tr>
    </table>
    <div style="background:#FCEBEB;border-radius:6px;padding:10px 14px;margin-bottom:16px;">
      <span style="font-size:13px;font-weight:700;color:#501313;">${total} obligations identified · ${critical} requiring immediate action</span>
    </div>
    <table width="100%" style="border:1px solid #e8e7e4;border-radius:6px;overflow:hidden;">
      <tr style="background:#f8f7f5;">
        <th style="padding:6px 10px;text-align:left;font-size:10px;color:#888;font-weight:600;border-bottom:1px solid #e8e7e4;">Obligation</th>
        <th style="padding:6px 10px;text-align:left;font-size:10px;color:#888;font-weight:600;border-bottom:1px solid #e8e7e4;">Priority</th>
        <th style="padding:6px 10px;text-align:left;font-size:10px;color:#888;font-weight:600;border-bottom:1px solid #e8e7e4;">Timing</th>
      </tr>
      ${obligations.map((ob: any) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e8e7e4;font-size:12px;font-weight:600;color:#0d0d0d;">${ob.name.substring(0, 50)}</td><td style="padding:6px 10px;border-bottom:1px solid #e8e7e4;font-size:11px;font-weight:700;color:${URGENCY_COLOR[ob.urgency]};">${ob.urgency_label}</td><td style="padding:6px 10px;border-bottom:1px solid #e8e7e4;font-size:11px;color:#555;">${ob.timing}</td></tr>`).join('')}
    </table>
    ${profileRows}
  </div>
</div>
</body></html>`

    // ── SEND LEAD EMAIL ────────────────────────────────────────────
    const leadRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `ThemisIQ <${FROM_EMAIL}>`,
        to: [lead.email],
        reply_to: 'hello@themisiq.co',
        // 'obligations', not 'regulations', and matching the body's singular/plural handling. The
        // list has carried market-driven entries since the results were split into two groups —
        // EcoVadis, a customer questionnaire, a board request — and none of those is a regulation.
        // This was the last surface still using the old word, so subject and body disagreed.
        subject: `Your ThemisIQ Compliance Obligation Map — ${total} ${total === 1 ? 'obligation' : 'obligations'} identified for ${theirCompany}`,
        html: leadHtml,
        text: `ThemisIQ identified ${total} ${total === 1 ? 'obligation' : 'obligations'} that apply to ${theirCompany}. ${critical} ${critical === 1 ? 'requires' : 'require'} immediate action. Visit www.themisiq.co to get started.`,
      }),
    })

    const leadData = await leadRes.json()

    // ── SEND INTERNAL NOTIFICATION ─────────────────────────────────
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `ThemisIQ <${FROM_EMAIL}>`,
        to: [MONITOR_EMAIL],
        subject: `🔔 New lead: ${leadIdent} · ${critical} critical obligations`,
        html: notifyHtml,
        text: `New lead: ${leadName || NOT_GIVEN} · ${leadCompany || NOT_GIVEN} · ${leadEmail} · ${total} obligations · ${critical} critical`,
      }),
    })

    return NextResponse.json({ success: true, id: leadData.id })

  } catch (error) {
    console.error('Assessment submit error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
