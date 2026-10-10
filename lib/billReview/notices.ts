import 'server-only'
// lib/billReview/notices.ts
//
// BR7: SENDING THE BILL REVIEW EMAILS, through the outbox (supabase/migrations/20261016_bill_review_notices.sql). Server
// only, with the service-role client. The database decides what is sent and guarantees once only:
//   bill_review_enqueue_ready(inventory)   one 'ready' email per batch (Q8), when no bill is still waiting;
//   bill_review_enqueue_overdue(today)     one 'overdue' email per bill past its expected date (Q7).
// This module sends each pending or failed email and records every attempt: sent, or failed with its error, up to 5
// attempts. A failed email stays failed and visible to staff (BR8). Nothing is silent: every failure is logged, with
// metadata only (the notice id, the kind, the reason), never an address, a file name or a figure.
//
//   notifyIfBatchComplete   BR8 calls this after each reading or unreadable mark.
//   runDailyNotices         the daily job (/api/cron/bill-review-notices) calls this: overdue, then any complete batch
//                           not yet emailed, then a retry of everything unsent.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SITE_ORIGIN } from '../siteOrigin'
import { yearLabel } from '../ghg/reportingYear'
import { RESULTS_EMAIL_FROM, RESULTS_EMAIL_REPLY_TO } from '../ghg/resultsEmail'
import { buildReadyEmail, buildOverdueEmail, type BuiltEmail } from './noticeEmails'

export const MAX_ATTEMPTS = 5
type Fetch = typeof fetch
export type SendOutcome = 'sent' | 'failed' | 'skipped'

const inventoryLink = (inventoryId: string) => `${SITE_ORIGIN}/dashboard/ghg?id=${inventoryId}`

async function recordAttempt(admin: SupabaseClient, id: string, attempts: number, outcome: { ok: true } | { ok: false; error: string }) {
  const { error } = await admin.from('bill_review_notices')
    .update(outcome.ok ? { status: 'sent', attempts: attempts + 1 } : { status: 'failed', attempts: attempts + 1, last_error: outcome.error })
    .eq('id', id)
  if (error) console.error('[bill-review notices] attempt not recorded', { notice: id })
}

/** Build the email a notice stands for, from the outbox, the bills and the inventory. Null when it cannot be built. */
async function buildFor(admin: SupabaseClient, n: { id: string; kind: string; inventory_id: string }): Promise<BuiltEmail | null> {
  const { data: inv } = await admin.from('ghg_inventories').select('company_name, reporting_year, fiscal_year_end_month').eq('id', n.inventory_id).maybeSingle()
  const { data: docs } = await admin.from('bill_review_notice_documents')
    .select('bill_review_documents(file_name, location_name, expected_by)').eq('notice_id', n.id)
  if (!inv || !docs || docs.length === 0) return null
  const link = inventoryLink(n.inventory_id)
  if (n.kind === 'ready') {
    return buildReadyEmail({ companyName: inv.company_name, yearText: yearLabel(inv.reporting_year, inv.fiscal_year_end_month).inText, count: docs.length, link })
  }
  const d = (docs[0] as unknown as { bill_review_documents: { file_name: string; location_name: string | null; expected_by: string | null } }).bill_review_documents
  if (!d?.expected_by) return null
  return buildOverdueEmail({ fileName: d.file_name, companyName: inv.company_name, site: d.location_name, expectedBy: d.expected_by, link })
}

/** Send one notice, if it is unsent and has attempts left, and record the attempt. */
export async function sendNotice(admin: SupabaseClient, noticeId: string, doFetch: Fetch = fetch): Promise<SendOutcome> {
  const { data: n, error } = await admin.from('bill_review_notices').select('id, kind, inventory_id, user_id, status, attempts').eq('id', noticeId).maybeSingle()
  if (error || !n) { console.error('[bill-review notices] notice not read', { notice: noticeId }); return 'skipped' }
  if (n.status === 'sent' || n.attempts >= MAX_ATTEMPTS) return 'skipped'
  const apiKey = process.env.RESEND_API_KEY
  // Not configured: no attempt is spent, so the email goes once the key is set. Logged, never silent.
  if (!apiKey) { console.error('[bill-review notices] not sent: email is not configured', { notice: n.id, kind: n.kind }); return 'skipped' }
  const fail = async (reason: string) => {
    console.error('[bill-review notices] not sent', { notice: n.id, kind: n.kind, attempt: n.attempts + 1, reason })
    await recordAttempt(admin, n.id, n.attempts, { ok: false, error: reason })
    return 'failed' as const
  }
  const { data: user } = await admin.auth.admin.getUserById(n.user_id)
  const to = user?.user?.email
  if (!to) return fail('no_recipient')
  const email = await buildFor(admin, n)
  if (!email) return fail('not_built')
  try {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: RESULTS_EMAIL_FROM, reply_to: RESULTS_EMAIL_REPLY_TO, to: [to], subject: email.subject, text: email.text, html: email.html }),
    })
    const body = await res.json().catch(() => null) as { error?: unknown } | null
    if (!res.ok || body?.error) return fail(`resend_${res.status}`)
  } catch {
    return fail('network')
  }
  await recordAttempt(admin, n.id, n.attempts, { ok: true })
  return 'sent'
}

/** BR8 calls this after each reading or unreadable mark: one 'ready' email per batch, sent at once. */
export async function notifyIfBatchComplete(admin: SupabaseClient, inventoryId: string, doFetch: Fetch = fetch): Promise<SendOutcome | 'not_complete'> {
  const { data: id, error } = await admin.rpc('bill_review_enqueue_ready', { p_inventory_id: inventoryId })
  if (error) { console.error('[bill-review notices] ready not enqueued', { inventoryId }); return 'skipped' }
  if (!id) return 'not_complete'
  return sendNotice(admin, id as string, doFetch)
}

/** The daily job: overdue emails for `today` (Toronto's date), complete batches not yet emailed, then every retry. */
export async function runDailyNotices(admin: SupabaseClient, today: string, doFetch: Fetch = fetch) {
  const out = { overdueEnqueued: 0, readyEnqueued: 0, sent: 0, failed: 0, skipped: 0, errors: [] as string[] }
  const { data: n, error: oErr } = await admin.rpc('bill_review_enqueue_overdue', { p_today: today })
  if (oErr) { out.errors.push('overdue_not_enqueued'); console.error('[bill-review notices] overdue not enqueued') } else out.overdueEnqueued = Number(n ?? 0)
  // A batch BR8 completed but whose email was not enqueued (a failed call): the function makes this a no-op otherwise.
  const { data: done, error: dErr } = await admin.from('bill_review_documents').select('inventory_id').neq('status', 'waiting')
  if (dErr) { out.errors.push('batches_not_read'); console.error('[bill-review notices] batches not read') }
  for (const inv of [...new Set((done ?? []).map(d => d.inventory_id as string))]) {
    const { data: id, error } = await admin.rpc('bill_review_enqueue_ready', { p_inventory_id: inv })
    if (error) { out.errors.push('ready_not_enqueued'); console.error('[bill-review notices] ready not enqueued', { inventoryId: inv }) }
    else if (id) out.readyEnqueued++
  }
  const { data: unsent, error: uErr } = await admin.from('bill_review_notices').select('id').neq('status', 'sent').lt('attempts', MAX_ATTEMPTS)
  if (uErr) { out.errors.push('unsent_not_read'); console.error('[bill-review notices] unsent not read'); return out }
  for (const u of unsent ?? []) out[await sendNotice(admin, u.id as string, doFetch)]++
  return out
}
