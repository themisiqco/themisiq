// lib/ghg/resultsEmailSend.ts
//
// SERVER ONLY. Sends the results email through the Resend API (LEAD1 L5, Oct 2026; design section 2, Q-L9), the same
// fetch the other routes use (app/api/order/quote-request/route.ts sendEmail), with this email's own sender:
// From "ThemisIQ <hello@themisiq.co>", Reply-To hello@themisiq.co. RESEND_API_KEY names the key; its value is in Vercel.
//
// ⚠️ IT NEVER THROWS, AND A FAILURE NEVER UNDOES A SAVE. The callers send after the calculation is saved; the result
// says whether the email went, with what was observed when it did not, and the caller reports that to the visitor.

import { RESULTS_EMAIL_FROM, RESULTS_EMAIL_REPLY_TO, type ResultsEmail } from './resultsEmail'

export type SendResult = { ok: true; id: string | null } | { ok: false; reason: string }

export async function sendResultsEmail(
  to: string,
  email: ResultsEmail,
  doFetch: typeof fetch = fetch,
  apiKey: string | undefined = process.env.RESEND_API_KEY,
): Promise<SendResult> {
  if (!apiKey) {
    console.error('[results-email] RESEND_API_KEY is not set; nothing was sent.')
    return { ok: false, reason: 'not_configured' }
  }
  try {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESULTS_EMAIL_FROM, to: [to], reply_to: RESULTS_EMAIL_REPLY_TO,
        subject: email.subject, html: email.html, text: email.text,
        // L6: List-Unsubscribe and List-Unsubscribe-Post, when the email carries the unsubscribe link.
        ...(email.headers ? { headers: email.headers } : {}),
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[results-email] Resend refused:', res.status, detail.slice(0, 300))
      return { ok: false, reason: `resend_${res.status}` }
    }
    const body = await res.json().catch(() => ({})) as { id?: string }
    return { ok: true, id: body.id ?? null }
  } catch (err) {
    console.error('[results-email] send failed:', err)
    return { ok: false, reason: 'network' }
  }
}
