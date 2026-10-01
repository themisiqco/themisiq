import { NextRequest, NextResponse } from 'next/server'
// The two emails are built in lib/assessmentEmail.ts, which holds their colours, copy and the module cells
// (resolved from lib/obligations.ts, never posted by the client). A route file may export only its HTTP
// handlers, so the builders live there, where they are tested and can be previewed without sending.
import { buildLeadEmailHtml, buildNotifyHtml } from '../../../../lib/assessmentEmail'
import { checkAndRecordRateLimit, ipFromHeaders } from '../../../../lib/rateLimit'
import {
  ASSESSMENT_IP_BUCKET, ASSESSMENT_IP_LIMIT, ASSESSMENT_IP_WINDOW_MS,
  ASSESSMENT_EMAIL_BUCKET, ASSESSMENT_EMAIL_LIMIT, ASSESSMENT_EMAIL_WINDOW_MS,
  HONEYPOT_FIELD, isHoneypotTripped, recipientKey,
} from '../../../../lib/assessmentSubmitGuard'
import { NOT_PROVIDED } from '../../../../lib/notProvided'
import { subjectText } from '../../../../lib/emailSubject'

const RESEND_API_KEY   = process.env.RESEND_API_KEY!
const FROM_EMAIL       = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'

const MONITOR_EMAIL    = process.env.RESEND_MONITOR_EMAIL!

export async function POST(req: NextRequest) {
  try {
    const { lead, obligations, profile } = await req.json()

    if (!lead?.email || !lead.email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // ── ABUSE GUARD ─────────────────────────────────────────────────────────────────────────────
    //
    // ⚠️ EVERY REJECTION BELOW RETURNS THE ORDINARY SUCCESS RESPONSE, AND THAT IS THE POINT. A
    // distinct status or message turns this endpoint into an oracle: a caller could binary-search the
    // limits, learn which addresses have already been used, and tune around both. Silence costs a
    // legitimate visitor nothing, because the client at app/assess/page.tsx:609 awaits the fetch and
    // reads neither the status nor the body — it shows its own confirmation either way.
    //
    // ⚠️ THE RESPONSE OMITS `id`, WHICH THE SUCCESS PATH CARRIES. That id is RESEND'S MESSAGE ID, and
    // no email was sent, so there is no honest value for it. Inventing one would be fabricating a
    // provider receipt. The client reads neither field; a future consumer that needs to distinguish
    // them should be given a channel that is not this response.
    const silentOk = () => NextResponse.json({ success: true })

    // ⚠️ THE HONEYPOT IS CHECKED FIRST, BEFORE THE LIMITER, SO A BOT CANNOT FILL `rate_limits`. Every
    // allowed limiter call INSERTS a row; running the limiter on traffic already known to be a bot
    // would let a loop write unbounded rows through the service-role client, which is a second abuse
    // vector opened by the fix for the first.
    if (isHoneypotTripped((lead as Record<string, unknown>)[HONEYPOT_FIELD])) {
      console.warn('[assessment/submit] honeypot tripped, dropping submission')
      return silentOk()
    }

    const ip = ipFromHeaders(req)

    // Per IP, hourly. `email: null` so this call evaluates the IP axis alone — see the note on the
    // two windows in lib/assessmentSubmitGuard.ts.
    const ipRl = await checkAndRecordRateLimit({
      bucket: ASSESSMENT_IP_BUCKET, ip, email: null,
      ipLimit: ASSESSMENT_IP_LIMIT, emailLimit: ASSESSMENT_IP_LIMIT,
      windowMs: ASSESSMENT_IP_WINDOW_MS,
    })
    if (!ipRl.ok) {
      console.warn('[assessment/submit] IP limit reached, dropping submission')
      return silentOk()
    }

    // Per recipient, daily. Stops one address being mailed repeatedly from many addresses, which the
    // IP limit alone does not reach.
    const emailRl = await checkAndRecordRateLimit({
      bucket: ASSESSMENT_EMAIL_BUCKET, ip: null, email: recipientKey(lead.email),
      ipLimit: ASSESSMENT_EMAIL_LIMIT, emailLimit: ASSESSMENT_EMAIL_LIMIT,
      windowMs: ASSESSMENT_EMAIL_WINDOW_MS,
    })
    if (!emailRl.ok) {
      console.warn('[assessment/submit] recipient limit reached, dropping submission')
      return silentOk()
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
    const NOT_GIVEN = NOT_PROVIDED

    // Subject lines must still identify the lead in a full inbox. Name and company are both
    // optional, so the last resort is the email address: the one field that cannot be empty here.
    const leadIdent = [leadName, leadCompany].filter(Boolean).join(' · ') || leadEmail

    const posted   = Array.isArray(obligations) ? obligations : []
    const total    = posted.length
    const critical = posted.filter((o: { urgency?: string }) => o.urgency === 'critical').length
    const date     = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

    const leadHtml = buildLeadEmailHtml({ obligations: posted, theirCompany, leadIdent, date })
    const notifyHtml = buildNotifyHtml({
      obligations: posted, profile, date,
      lead: { name: leadName || NOT_GIVEN, company: leadCompany || NOT_GIVEN, role: leadRole || NOT_GIVEN, email: leadEmail },
    })

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
        subject: `Your ThemisIQ Compliance Obligation Map: ${total} ${total === 1 ? 'obligation' : 'obligations'} identified for ${theirCompany}`,
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
        subject: `🔔 New lead: ${subjectText(leadIdent)} · ${critical} critical obligations`,
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
