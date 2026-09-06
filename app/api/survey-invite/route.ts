// app/api/survey-invite/route.ts
//
// Sends a stakeholder-survey invitation or reminder to one respondent.
//
// FORKED FROM app/api/supplier-invite/route.ts, not shared with it. The auth pattern, the Resend
// call, the HTML-escaping and the ownership recheck all transfer verbatim; the route body does not,
// because it is bound to campaign_suppliers / supplier_campaigns and this reads
// materiality_survey_respondents / _rounds. Generalising one route over two unrelated table pairs
// would put a branch on every line that matters, and the two instruments ask entirely different
// questions of the same audience — see 20260828's header on why they must not be merged.
//
// ⚠️ ERRORS SURFACE, AT BOTH ENDS. A respondent who was never emailed but shows as "invited" is the
// worst state the progress screen can produce: the buyer chases the wrong thing, and the survey
// looks under-answered when it was never sent. So:
//   * the Resend response is checked and its message returned verbatim;
//   * a non-2xx from Resend is caught even when the body carries no `error` key;
//   * invited_at / reminder_sent_at are stamped ONLY after a confirmed send, never before.
//
// ⚠️ AND THE STAMP IS THE FIX FOR A DEFECT INHERITED FROM THE PORTAL. campaign_suppliers.invited_at
// is a column DEFAULT set when the row is created, so the supplier portal shows when a supplier was
// ADDED and calls it "Invited". materiality_survey_respondents.invited_at has the same default; this
// route overwrites it on a successful first send, so the buyer's screen shows when the email
// actually went. ESRS 2 SBM-2 asks for field dates, and "when I typed their name in" is not one.
//
// ⚠️ THREE TABLES NOW, NOT TWO. materiality_impact_assignments.invited_at (20260838:313) was copied
// out of materiality_survey_respondents and inherited the same `not null default now()` — the THIRD
// occurrence of one defect, and the worst of the three, because that table had no send route at all
// until 23 Aug 2026: every row in it claimed an invitation the product had never issued. 20260852
// removes the default, makes the column nullable, and adds an 'added' status so the row can start
// somewhere true; app/api/impact-invite/route.ts is the stamp. THE PATTERN IS THE POINT — a
// timestamp named for an event, defaulted at INSERT, records the wrong event by construction. The
// next table forked from any of these three must not carry it a fourth time.
//
// ⚠️ AND THE FOURTH OCCURRENCE IS ALREADY HERE, one line below the two above: THIS table's own
// `status` has the matching defect. materiality_survey_respondents.status is `not null default
// 'invited'`, so a respondent added and never emailed reads as invited — and unlike invited_at,
// this route never corrects it. It is read as a literal in five places
// (app/dashboard/materiality/survey/[id]/page.tsx:118,168,371,379,381), one of which chooses who a
// bulk reminder targets, so someone who was never sent an invitation can be sent a reminder about
// it. 20260852 fixes the shape on materiality_impact_assignments only; the same change has NOT been
// made here. Left named rather than silently fixed: this table's 'invited' is load-bearing in those
// five call sites and moving it needs its own pass.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'
import { INK_MUTED } from '@/lib/brand'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@themisiq.co'

const sendEmail = async (to: string, subject: string, html: string) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ThemisIQ <${FROM_EMAIL}>`, to, subject, html }),
  })
  let body: any = null
  try { body = await res.json() } catch { /* a non-JSON body is still a failure below */ }
  // ⚠️ ok is checked as well as body.error. A 4xx with an unexpected shape would otherwise read as
  // success, which is exactly the state this route exists to make impossible.
  if (!res.ok) {
    return { error: body?.error?.message || body?.message || `Resend returned ${res.status}.` }
  }
  if (body?.error) return { error: body.error.message || String(body.error) }
  return { id: body?.id as string | undefined }
}

// Buyer-entered free text reaches these templates (round name, company name). It comes from the
// database rather than the request body, but it is still user-authored, so escape it.
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const shell = (inner: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:0.5px solid #e8e7e4;">
    <div style="background:#0d0d0d;padding:24px 32px;">
      <!-- Georgia here is deliberate, not a missed sweep: this is email HTML. A mail client cannot resolve var(--font-display), and web fonts do not load reliably in mail, so Literata would silently fall back anyway. Georgia is web-safe and is what every recipient actually sees. See app/components/headingStyles.ts. -->
      <div style="font-size:20px;font-weight:700;color:#fff;font-family:Georgia,serif;">ThemisIQ</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;text-transform:uppercase;letter-spacing:0.08em;">Stakeholder survey</div>
    </div>
    <div style="padding:32px;">${inner}</div>
    <div style="background:#f8f7f5;border-top:0.5px solid #e8e7e4;padding:16px 32px;text-align:center;">
      <div style="font-size:11px;color:${INK_MUTED};">Powered by <a href="https://www.themisiq.co" style="color:#7425e3;text-decoration:none;">ThemisIQ</a></div>
    </div>
  </div>
</body></html>`

const cta = (url: string, label: string) => `
  <div style="text-align:center;margin:0 0 24px;">
    <a href="${url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7425e3,#1fb1ff);color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">${label} →</a>
  </div>
  <p style="margin:0 0 8px;color:${INK_MUTED};font-size:12px;line-height:1.6;">Or copy this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:11px;color:#7425e3;word-break:break-all;">${url}</p>`

/**
 * ⚠️ THE FIRST LINE HAS TO EARN THE REST. A supplier's compliance contact receiving this from a
 * customer's sustainability team has no idea why, and an unexplained survey link from an unfamiliar
 * sender is deleted. So the opening sentence names WHO is asking, WHAT THEIR RELATIONSHIP IS, and
 * WHY — before anything about ESRS, before the button, before the deadline.
 */
const inviteHtml = (o: {
  name: string | null; company: string; roundName: string
  deadline: string | null; url: string; external: boolean
}) => {
  const company = escapeHtml(o.company)
  const greeting = o.name ? `Dear ${escapeHtml(o.name)},` : 'Hello,'
  const why = o.external
    ? `<strong style="color:#0d0d0d;">${company}</strong> is asking for your view as one of the organisations and people it works with.`
    : `<strong style="color:#0d0d0d;">${company}</strong> is asking for your view as someone who works there.`
  const deadline = o.deadline
    ? `<p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">Please reply by <strong>${new Date(o.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>`
    : ''

  return shell(`
    <p style="margin:0 0 16px;color:#0d0d0d;font-size:15px;">${greeting}</p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      ${why} It is working out which sustainability topics matter most — to its business and to the
      people and places its work affects — and is asking a range of people which ones they think
      should be prioritised.
    </p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      There is one question per topic and it takes about fifteen minutes. There is nothing to look
      up, and “not enough visibility to assess” is a real answer on any question you cannot judge.
    </p>
    ${deadline}
    ${cta(o.url, 'Start the survey')}
    <div style="border-top:0.5px solid #e8e7e4;padding-top:20px;">
      <p style="margin:0;color:${INK_MUTED};font-size:11px;line-height:1.6;">
        Sent on behalf of ${company} via ThemisIQ. Your individual scores are combined with everyone
        else's before ${company} sees them; anything you type in a comment box is passed on as you
        wrote it. Questions about the request itself should go to ${company} directly.
      </p>
    </div>`)
}

const reminderHtml = (o: {
  name: string | null; company: string; deadline: string | null; url: string; started: boolean
}) => {
  const company = escapeHtml(o.company)
  const greeting = o.name ? `Dear ${escapeHtml(o.name)},` : 'Hello,'
  const deadline = o.deadline
    ? ` The deadline is <strong>${new Date(o.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.`
    : ''
  return shell(`
    <p style="margin:0 0 16px;color:#0d0d0d;font-size:15px;">${greeting}</p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      A reminder that <strong style="color:#0d0d0d;">${company}</strong> would still like your view on
      which sustainability topics it should prioritise.${deadline}
    </p>
    <p style="margin:0 0 24px;color:#555553;font-size:14px;line-height:1.6;">
      ${o.started
        ? 'Your answers so far have been saved — the link picks up where you left off.'
        : 'It takes about fifteen minutes, and you can stop and come back to the same link.'}
    </p>
    ${cta(o.url, o.started ? 'Continue the survey' : 'Start the survey')}`)
}

export async function POST(req: NextRequest) {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  }
  const { supabase, userId } = authed

  const body = await req.json().catch(() => ({}))
  // company_name is deliberately NOT read from the body — it is derived from the round below, so a
  // client cannot choose the name the email is sent under.
  const { respondent_id, type = 'invite' } = body as { respondent_id?: string; type?: 'invite' | 'reminder' }

  if (!respondent_id) {
    return NextResponse.json({ error: 'Missing respondent_id' }, { status: 400 })
  }

  const { data: r, error: rErr } = await supabase
    .from('materiality_survey_respondents')
    .select('id, token, invite_name, invite_email, track, status, user_id, round_id, materiality_survey_rounds(name, company_name, deadline, user_id)')
    .eq('id', respondent_id)
    .maybeSingle()

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  if (!r) return NextResponse.json({ error: 'Respondent not found' }, { status: 404 })

  const round = (r as any).materiality_survey_rounds
  if (!round) return NextResponse.json({ error: 'The round for this respondent could not be read.' }, { status: 500 })

  // RLS already blocks a cross-tenant respondent_id; this keeps the ownership dependency visible in
  // the route, so switching to a service-role client cannot silently remove it.
  if (round.user_id !== userId) {
    return NextResponse.json({ error: 'Not your survey round' }, { status: 403 })
  }
  if (!r.invite_email) {
    return NextResponse.json({ error: 'This respondent has no email address, so there is nothing to send to.' }, { status: 400 })
  }
  if (r.status === 'revoked' || r.status === 'expired') {
    return NextResponse.json({ error: `This invitation is ${r.status} and its link no longer works. Nothing was sent.` }, { status: 400 })
  }
  if (r.status === 'completed') {
    return NextResponse.json({ error: 'This person has already submitted. Nothing was sent.' }, { status: 400 })
  }

  const company = round.company_name || round.name
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.themisiq.co'}/survey/${r.token}`

  // Not escaped: a subject is a header, not HTML.
  const subject = type === 'reminder'
    ? `Reminder: ${company} would like your view`
    : `${company} would like your view on its sustainability priorities`

  const html = type === 'reminder'
    ? reminderHtml({ name: r.invite_name, company, deadline: round.deadline, url, started: r.status === 'in_progress' })
    : inviteHtml({ name: r.invite_name, company, roundName: round.name, deadline: round.deadline, url, external: r.track === 'external' })

  const result = await sendEmail(r.invite_email, subject, html)

  if (result.error) {
    // Verbatim, and NOTHING is stamped. The respondent stays visibly un-sent.
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // ⚠️ STAMPED ONLY AFTER A CONFIRMED SEND. A failure above returns before reaching this line, so a
  // row can never carry a send timestamp for an email that did not go.
  const stamp = new Date().toISOString()
  const { error: upErr } = await supabase
    .from('materiality_survey_respondents')
    .update(type === 'reminder' ? { reminder_sent_at: stamp } : { invited_at: stamp })
    .eq('id', respondent_id)

  if (upErr) {
    // The email DID go. Say both things — reporting a clean failure would have the buyer send twice.
    return NextResponse.json({
      warning: `The email was sent, but the record of it was not saved (${upErr.message}). It may show as not yet sent.`,
      email_id: result.id,
    })
  }

  return NextResponse.json({ success: true, email_id: result.id, sent_at: stamp })
}
