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
import { buildReadyEmail, buildOverdueEmail, buildStaffNewBatchEmail, buildStaffDigestEmail, type BuiltEmail } from './noticeEmails'
import { customerBillState } from './billState'
import { sortQueue, isOverdue } from './queueOrder'
import { torontoParts } from './businessDays'
import { docTypeLabel } from '../ghg/conciergeDocTypes'
import type { Location, LocationEvent } from '../ghg/engine'

export const MAX_ATTEMPTS = 5
type Fetch = typeof fetch
export type SendOutcome = 'sent' | 'failed' | 'skipped'

const inventoryLink = (inventoryId: string) => `${SITE_ORIGIN}/dashboard/ghg?id=${inventoryId}`
const STAFF_LINK = `${SITE_ORIGIN}/staff/bill-review`
type WaitingDoc = { inventory_id: string; source_doc_id: string; location_name: string | null; document_type: string; submitted_at: string; expected_by: string | null }
type InvFacts = { id: string; company_name: string | null; reporting_year: number; fiscal_year_end_month: number | null; locations_data: Location[] | null; location_log: LocationEvent[] | null }

/** The bills waiting for the team, each still on its saved inventory and not withdrawn (BR4's customerBillState). */
async function waitingBills(admin: SupabaseClient): Promise<{ docs: WaitingDoc[]; invs: Map<string, InvFacts> } | null> {
  const { data: docs, error } = await admin.from('bill_review_documents').select('inventory_id, source_doc_id, location_name, document_type, submitted_at, expected_by').eq('status', 'waiting')
  if (error || !docs) return null
  const ids = [...new Set((docs as WaitingDoc[]).map(d => d.inventory_id))]
  const { data: invs, error: iErr } = ids.length
    ? await admin.from('ghg_inventories').select('id, company_name, reporting_year, fiscal_year_end_month, locations_data, location_log').in('id', ids)
    : { data: [], error: null }
  if (iErr || !invs) return null
  const byId = new Map((invs as InvFacts[]).map(i => [i.id, i]))
  const on = (docs as WaitingDoc[]).filter(d => { const i = byId.get(d.inventory_id); return !!i && customerBillState(i.locations_data ?? [], i.location_log, d.source_doc_id) === 'on_inventory' })
  return { docs: on, invs: byId }
}
const yearOf = (i: InvFacts) => yearLabel(i.reporting_year, i.fiscal_year_end_month).inText

async function recordAttempt(admin: SupabaseClient, id: string, attempts: number, outcome: { ok: true } | { ok: false; error: string }) {
  const { error } = await admin.from('bill_review_notices')
    .update(outcome.ok ? { status: 'sent', attempts: attempts + 1 } : { status: 'failed', attempts: attempts + 1, last_error: outcome.error })
    .eq('id', id)
  if (error) console.error('[bill-review notices] attempt not recorded', { notice: id })
}

/** Build the email a notice stands for, from the outbox, the bills and the inventory. Null when it cannot be built. */
async function buildFor(admin: SupabaseClient, n: { id: string; kind: string; inventory_id: string | null }): Promise<BuiltEmail | null> {
  // Staff emails (ruled 10 Oct 2026): built from the bills waiting when they are sent, never a figure, a bill's
  // contents, a file name or link, or a customer's email address.
  if (n.kind === 'staff_digest') {
    const w = await waitingBills(admin)
    if (!w || w.docs.length === 0) return null
    const today = torontoParts(new Date()).date
    const items = sortQueue(w.docs, today).map(d => {
      const i = w.invs.get(d.inventory_id)!
      return { companyName: i.company_name, yearText: yearOf(i), site: d.location_name, documentType: docTypeLabel(d.document_type), expectedBy: d.expected_by, overdue: isOverdue(d, today) }
    })
    return buildStaffDigestEmail({ items, link: STAFF_LINK })
  }
  if (n.kind === 'staff_new_batch') {
    if (!n.inventory_id) return null
    // From the team's record: the first bill is sent before the upload saves it onto the inventory.
    const { data: rows } = await admin.from('bill_review_documents').select('location_name, expected_by').eq('inventory_id', n.inventory_id).eq('status', 'waiting')
    const { data: inv } = await admin.from('ghg_inventories').select('id, company_name, reporting_year, fiscal_year_end_month').eq('id', n.inventory_id).maybeSingle()
    if (!inv || !rows || rows.length === 0) return null
    const sites = [...new Set(rows.map(r => r.location_name as string | null).filter((x): x is string => !!x))]
    const dates = rows.map(r => r.expected_by as string | null).filter((x): x is string => !!x).sort()
    return buildStaffNewBatchEmail({ companyName: inv.company_name, yearText: yearOf(inv as InvFacts), sites, count: rows.length, expectedBy: dates[0] ?? null, link: STAFF_LINK })
  }
  if (!n.inventory_id) return null
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

/** The submit route calls this after recording a bill: one email per bill_reader when the bill starts a batch. */
export async function notifyStaffNewBatch(admin: SupabaseClient, documentId: string, doFetch: Fetch = fetch): Promise<SendOutcome[]> {
  const { data: ids, error } = await admin.rpc('bill_review_enqueue_staff_new_batch', { p_document_id: documentId })
  if (error) { console.error('[bill-review notices] staff new batch not enqueued', { documentId }); return [] }
  const out: SendOutcome[] = []
  for (const id of (ids as string[] | null) ?? []) out.push(await sendNotice(admin, id, doFetch))
  return out
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
  const out = { overdueEnqueued: 0, readyEnqueued: 0, digestEnqueued: 0, sent: 0, failed: 0, skipped: 0, errors: [] as string[] }
  const { data: n, error: oErr } = await admin.rpc('bill_review_enqueue_overdue', { p_today: today })
  if (oErr) { out.errors.push('overdue_not_enqueued'); console.error('[bill-review notices] overdue not enqueued') } else out.overdueEnqueued = Number(n ?? 0)
  // Staff (ruled 10 Oct 2026): the morning digest, one per bill_reader per Toronto day, only when a bill is waiting.
  const { data: dg, error: dgErr } = await admin.rpc('bill_review_enqueue_staff_digest', { p_today: today })
  if (dgErr) { out.errors.push('digest_not_enqueued'); console.error('[bill-review notices] digest not enqueued') } else out.digestEnqueued = ((dg as string[] | null) ?? []).length
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
