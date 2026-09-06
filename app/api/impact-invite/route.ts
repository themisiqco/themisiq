// app/api/impact-invite/route.ts
//
// Sends an impact-worksheet invitation or reminder to one named colleague.
//
// FORKED FROM app/api/survey-invite/route.ts, not shared with it — which was itself forked from
// supplier-invite. The auth pattern, the Resend call, the checked response, the HTML escaping and
// the ownership recheck transfer verbatim. The body does not: that route is bound to
// materiality_survey_respondents / _rounds and this reads materiality_impact_assignments /
// materiality_assessments, and the two instruments ask different people for different things. A
// survey respondent gives a view; a contributor here makes the ESRS 1 para 40-41 SEVERITY
// DETERMINATION for named sub-topics, and the report attributes it to them.
//
// ⚠️ ERRORS SURFACE, AT BOTH ENDS. A colleague who was never emailed but shows as "invited" is the
// worst state the worksheet can produce: the preparer chases the wrong person, and the assessment
// looks stalled when it was never sent. So:
//   * the Resend response is checked and its message returned verbatim;
//   * a non-2xx from Resend is caught even when the body carries no `error` key;
//   * status / invited_at / reminder_sent_at are stamped ONLY after a confirmed send, never before.
//
// ⚠️ THE ROW DECIDES THE STAMP; THE CALLER ONLY CHOOSES THE WORDS. survey-invite takes `type` from
// the body and stamps accordingly, so asking for an "invite" on an already-invited respondent
// overwrites invited_at and destroys the record of when the first one went. Here `type` selects the
// EMAIL COPY and nothing else — what gets written is derived from the row's own status. A first
// send is the only thing that can move 'added' -> 'invited', and invited_at can therefore only ever
// be written once. This is the same reasoning as impact_save_determination having no p_status and
// no p_force (20260840:303): the parameters a caller does not get are what make the invariant hold.
//
// ⚠️ AND 'added' IS WHY THERE IS ANYTHING TO MOVE. Until 20260852 the column defaulted to 'invited'
// and invited_at defaulted to now(), so the row asserted an invitation at INSERT and this route
// would have had nothing to transition. See that migration's header — this table was the THIRD
// occurrence of the campaign_suppliers defect, and survey-invite's header now names all three.
//
// ⚠️ NO RATE LIMITER, matching survey-invite. The worksheet sends one colleague at a time and there
// is no bulk control here; if one is ever added it must be sequential for the reason recorded at
// app/dashboard/materiality/survey/[id]/page.tsx:165.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'

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

// Preparer-entered free text reaches these templates (company name, contributor name, role). It
// comes from the database rather than the request body, but it is still user-authored, so escape it.
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
      <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;text-transform:uppercase;letter-spacing:0.08em;">Impact materiality</div>
    </div>
    <div style="padding:32px;">${inner}</div>
    <div style="background:#f8f7f5;border-top:0.5px solid #e8e7e4;padding:16px 32px;text-align:center;">
      <div style="font-size:11px;color:#888784;">Powered by <a href="https://www.themisiq.co" style="color:#7425e3;text-decoration:none;">ThemisIQ</a></div>
    </div>
  </div>
</body></html>`

const cta = (url: string, label: string) => `
  <div style="text-align:center;margin:0 0 24px;">
    <a href="${url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7425e3,#1fb1ff);color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">${label} →</a>
  </div>
  <p style="margin:0 0 8px;color:#888784;font-size:12px;line-height:1.6;">Or copy this link into your browser:</p>
  <p style="margin:0 0 24px;font-size:11px;color:#7425e3;word-break:break-all;">${url}</p>`

const asDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * ⚠️ THE FIRST LINE HAS TO EARN THE REST, and this recipient is a COLLEAGUE, not a supplier. They
 * know the company; what they do not know is why a compliance tool is emailing them, why THEM, and
 * whether it is going to cost them an afternoon. So the opening names who asked for them by name,
 * what they are being asked to judge, and how much of it there is — before the button.
 *
 * ⚠️ IT ALSO HAS TO SAY WHAT IT IS NOT. The commonest reason a delegated determination comes back
 * wrong is the assignee guessing at a score they think is wanted. The contributor screen shows no
 * severity number for exactly that reason (app/impact/[token]/page.tsx), and this email must not
 * undo it by implying there is a target.
 */
const inviteHtml = (o: {
  name: string | null; role: string | null; company: string
  subtopics: number; expiresAt: string; url: string
}) => {
  const company = escapeHtml(o.company)
  const greeting = o.name ? `Dear ${escapeHtml(o.name)},` : 'Hello,'
  const because = o.role
    ? ` as ${escapeHtml(o.role)}`
    : ''
  return shell(`
    <p style="margin:0 0 16px;color:#0d0d0d;font-size:15px;">${greeting}</p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      <strong style="color:#0d0d0d;">${company}</strong> is working out which sustainability topics
      matter most to its business and to the people and places its work affects, and has asked for
      your judgement${because} on <strong style="color:#0d0d0d;">${o.subtopics}</strong> of them.
    </p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      For each one you say whether the impact is already happening or might happen, and how serious
      it would be. These are judgements from what you see in your own area — there is nothing to
      look up, no score to hit, and “not enough visibility to assess” is a real answer on any
      question you cannot judge.
    </p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      Your answers are recorded against your name and appear in the assessment as yours.
    </p>
    ${cta(o.url, 'Open your part')}
    <div style="border-top:0.5px solid #e8e7e4;padding-top:20px;">
      <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
        The link is personal to you and stops working on ${asDate(o.expiresAt)}. Sent on behalf of
        ${company} via ThemisIQ. Questions about the request itself should go to ${company} directly.
      </p>
    </div>`)
}

const reminderHtml = (o: {
  name: string | null; company: string; subtopics: number
  expiresAt: string; url: string; started: boolean
}) => {
  const company = escapeHtml(o.company)
  const greeting = o.name ? `Dear ${escapeHtml(o.name)},` : 'Hello,'
  return shell(`
    <p style="margin:0 0 16px;color:#0d0d0d;font-size:15px;">${greeting}</p>
    <p style="margin:0 0 16px;color:#555553;font-size:14px;line-height:1.6;">
      A reminder that <strong style="color:#0d0d0d;">${company}</strong> is still waiting on your
      part of its impact assessment — ${o.subtopics}
      ${o.subtopics === 1 ? 'sub-topic' : 'sub-topics'} assigned to you.
    </p>
    <p style="margin:0 0 24px;color:#555553;font-size:14px;line-height:1.6;">
      ${o.started
        ? 'Your answers so far have been saved — the link picks up where you left off.'
        : 'There is nothing to look up, and you can stop and come back to the same link.'}
    </p>
    ${cta(o.url, o.started ? 'Continue your part' : 'Open your part')}
    <div style="border-top:0.5px solid #e8e7e4;padding-top:20px;">
      <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
        The link stops working on ${asDate(o.expiresAt)}.
      </p>
    </div>`)
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
  // company_name is deliberately NOT read from the body — it is derived from the assessment below,
  // so a client cannot choose the name the email is sent under.
  const { assignment_id, type = 'invite' } =
    body as { assignment_id?: string; type?: 'invite' | 'reminder' }

  if (!assignment_id) {
    return NextResponse.json({ error: 'Missing assignment_id' }, { status: 400 })
  }

  const { data: a, error: aErr } = await supabase
    .from('materiality_impact_assignments')
    .select('id, token, contributor_name, contributor_email, contributor_role, status, '
          + 'expires_at, revoked_at, invited_at, user_id, assessment_id, '
          + 'materiality_assessments(company_name, user_id)')
    .eq('id', assignment_id)
    .maybeSingle()

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  if (!a) return NextResponse.json({ error: 'Contributor not found' }, { status: 404 })

  // Named rather than inferred: the embedded relation widens the inferred row to a union the
  // property reads cannot see through, and writing the shape out is also the clearest statement of
  // what this route depends on. invited_at is `string | null` since 20260852 — the null is what
  // "nobody has emailed this person" looks like, and firstSend below is derived from status, not
  // from this, because status is the column the CHECK constrains.
  const asg = a as unknown as {
    id: string; token: string
    contributor_name: string | null; contributor_email: string | null
    contributor_role: string | null
    status: string; expires_at: string; revoked_at: string | null; invited_at: string | null
    user_id: string; assessment_id: string
    materiality_assessments: { company_name: string | null; user_id: string } | null
  }

  const assessment = asg.materiality_assessments
  if (!assessment) {
    return NextResponse.json(
      { error: 'The assessment this contributor belongs to could not be read.' }, { status: 500 })
  }

  // RLS already blocks a cross-tenant assignment_id; this keeps the ownership dependency visible in
  // the route, so switching to a service-role client cannot silently remove it.
  if (assessment.user_id !== userId) {
    return NextResponse.json({ error: 'Not your assessment' }, { status: 403 })
  }
  if (!asg.contributor_email) {
    return NextResponse.json(
      { error: 'This contributor has no email address, so there is nothing to send to.' },
      { status: 400 })
  }

  // ⚠️ THE SAME FOUR CONDITIONS impact_get REFUSES (20260840:158), CHECKED HERE TOO. Sending a link
  // that the RPC will refuse the moment it is clicked is the "looks like it worked" failure in its
  // purest form — the preparer sees a successful send and the colleague sees "invalid token".
  if (asg.status === 'revoked' || asg.status === 'expired' || asg.revoked_at) {
    return NextResponse.json(
      { error: 'This contributor’s access has been withdrawn and their link no longer works. '
             + 'Nothing was sent.' }, { status: 400 })
  }
  if (new Date(asg.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: `This invitation expired on ${asDate(asg.expires_at)} and its link no longer works. `
             + 'Nothing was sent.' }, { status: 400 })
  }
  if (asg.status === 'submitted') {
    return NextResponse.json(
      { error: 'This person has already submitted their determinations. Nothing was sent.' },
      { status: 400 })
  }

  // ⚠️ AN ASSIGNMENT WITH NO SUB-TOPICS IS NOT AN INVITATION. The contributor screen would open on
  // an empty list, and the email would have named a number of things to judge that is zero. This is
  // the same refusal the module makes elsewhere: say what is missing rather than send something
  // that appears to work.
  const { count, error: cErr } = await supabase
    .from('materiality_impact_assignment_subtopics')
    .select('subtopic_code', { count: 'exact', head: true })
    .eq('assignment_id', assignment_id)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  const subtopics = count ?? 0
  if (subtopics === 0) {
    return NextResponse.json(
      { error: 'No sub-topics are assigned to this contributor yet, so there is nothing for them '
             + 'to determine. Divide the sub-topics first. Nothing was sent.' }, { status: 400 })
  }

  const company = assessment.company_name || 'Your organisation'
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.themisiq.co'}/impact/${asg.token}`

  // Not escaped: a subject is a header, not HTML.
  const subject = type === 'reminder'
    ? `Reminder: ${company} is waiting on your part of its impact assessment`
    : `${company} has asked for your judgement on ${subtopics} sustainability ${subtopics === 1 ? 'topic' : 'topics'}`

  const html = type === 'reminder'
    ? reminderHtml({
        name: asg.contributor_name, company, subtopics,
        expiresAt: asg.expires_at, url, started: asg.status === 'in_progress',
      })
    : inviteHtml({
        name: asg.contributor_name, role: asg.contributor_role, company, subtopics,
        expiresAt: asg.expires_at, url,
      })

  const result = await sendEmail(asg.contributor_email, subject, html)

  if (result.error) {
    // Verbatim, and NOTHING is stamped. The contributor stays visibly un-sent.
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // ⚠️ STAMPED ONLY AFTER A CONFIRMED SEND, and the ROW decides what is stamped — see the header.
  // A row still at 'added' has never been emailed, so this send IS the invitation: it takes the
  // status transition and the one-and-only invited_at. Anything else is a re-send, and writes
  // reminder_sent_at alone, leaving the original invitation date intact. That is also what keeps
  // materiality_impact_assignments_added_has_no_invite (20260852) satisfiable: the status and the
  // stamp move together or not at all.
  const stamp = new Date().toISOString()
  const firstSend = asg.status === 'added'
  const patch = firstSend
    ? { status: 'invited', invited_at: stamp }
    : { reminder_sent_at: stamp }

  const { data: upRows, error: upErr } = await supabase
    .from('materiality_impact_assignments')
    .update(patch)
    .eq('id', assignment_id)
    .select('id')

  // The email DID go. Say both things — reporting a clean failure would have the preparer send
  // twice. ⚠️ BOTH CHECKED: an update refused by RLS returns no error AND no row, so testing only
  // the error would report a stamp that was never written.
  if (upErr || !upRows || upRows.length === 0) {
    return NextResponse.json({
      warning: `The email was sent, but the record of it was not saved${upErr ? ` (${upErr.message})` : ''}. `
             + 'It may still show as not yet invited. Do not send again on that account.',
      email_id: result.id,
    })
  }

  return NextResponse.json({
    success: true, email_id: result.id, sent_at: stamp, first_send: firstSend,
  })
}
