// lib/billReview/noticeEmails.ts
//
// BR7: the two Bill Review emails to a customer, as text and HTML. Pure. Ruled 10 Oct 2026 (Q7, Q8, BR7 decision 6):
// "1 bill" or "{n} bills", never "bill(s)"; the year named by reportingYearLabel ("the year ending 30 September 2025"),
// never a bare number; dates in words. Service emails: no marketing unsubscribe header. Plain language, no em dash.

import { emailShell } from '../email/layout'
import { isoDateInWords } from '../ghg/dateWords'

export type BuiltEmail = { subject: string; text: string; html: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const bills = (n: number) => (n === 1 ? '1 bill' : `${n} bills`)
const company = (c: string | null | undefined) => c?.trim() || 'your inventory'
const FOOTER = 'You are receiving this because your bills are read by the ThemisIQ Bill Review team. Questions: hello@themisiq.co.'
const STAFF_FOOTER = 'You are receiving this because you read bills for ThemisIQ Bill Review.'

function build(subject: string, paragraphs: string[], link: { href: string; label: string }, footer = FOOTER): BuiltEmail {
  const text = [...paragraphs, `${link.label}: ${link.href}`, '', footer].join('\n\n')
  const contentHtml = paragraphs.map(p => `<p style="margin:0 0 14px;">${esc(p)}</p>`).join('')
    + `<p style="margin:0 0 14px;"><a href="${esc(link.href)}">${esc(link.label)}</a></p>`
  return { subject, text, html: emailShell({ title: subject, preheader: paragraphs[0], contentHtml, footerLines: [footer] }) }
}

/** Q8: once per batch, when the last waiting bill of an inventory is read (read or unreadable). */
export function buildReadyEmail(a: { companyName: string | null; yearText: string; count: number; link: string }): BuiltEmail {
  return build('Your bills are ready to confirm', [
    `Our team has finished reading ${bills(a.count)} for ${company(a.companyName)}, ${a.yearText}.`,
    'Open the inventory to confirm each figure. Export stays locked until you do.',
  ], { href: a.link, label: 'Open the inventory' })
}

/** Q7: the morning after a bill's expected date is missed (Toronto time), once per bill. */
export function buildOverdueEmail(a: { fileName: string; companyName: string | null; site: string | null; expectedBy: string; link: string }): BuiltEmail {
  const where = a.site?.trim() ? `${company(a.companyName)}, ${a.site.trim()}` : company(a.companyName)
  return build('A bill is running late', [
    `We expected to finish reading ${a.fileName} for ${where}, by ${isoDateInWords(a.expectedBy)}, and we are still reading it.`,
    'It has not been sent to the AI. You will hear from us when it is ready to confirm.',
  ], { href: a.link, label: 'Open the inventory' })
}

// ── STAFF EMAILS (ruled 10 Oct 2026) ─────────────────────────────────────────────────────────────────────────────────
// To every active bill_reader. Never a figure, a bill's contents, a file name or link, or a customer's email address:
// the company, the reporting-year label, sites, document types, counts and dates only. The link is the staff page.

const listInWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** A submit started a batch: once per batch, never per bill. The count is the bills waiting when it is sent. */
export function buildStaffNewBatchEmail(a: { companyName: string | null; yearText: string; sites: string[]; count: number; expectedBy: string | null; link: string }): BuiltEmail {
  const sites = a.sites.filter(Boolean)
  return build(`New bills for Bill Review: ${company(a.companyName)}`, [
    `${company(a.companyName)}, ${a.yearText}, has sent bills for a ThemisIQ specialist to read.`,
    `${sites.length === 1 ? 'Site' : 'Sites'}: ${sites.length ? listInWords(sites) : 'not named'}. ${bills(a.count)} so far${a.expectedBy ? `; the first is expected by ${isoDateInWords(a.expectedBy)}` : '; no expected date is set'}.`,
  ], { href: a.link, label: 'Open the queue' }, STAFF_FOOTER)
}

export type DigestItem = { companyName: string | null; yearText: string; site: string | null; documentType: string; expectedBy: string | null; overdue: boolean }

/** The morning digest: every waiting bill, overdue first, then oldest. Sent only when something is waiting. */
export function buildStaffDigestEmail(a: { items: DigestItem[]; link: string }): BuiltEmail {
  const n = a.items.length
  const late = a.items.filter(i => i.overdue).length
  const lines = a.items.map(i => `${i.overdue ? 'Overdue. ' : ''}${company(i.companyName)}, ${i.yearText}, ${i.site?.trim() || 'site not named'}: ${i.documentType}. Expected by ${i.expectedBy ? isoDateInWords(i.expectedBy) : 'a date not set'}.`)
  return build(`Bill Review: ${bills(n)} waiting`, [
    `${n === 1 ? '1 bill is' : `${n} bills are`} waiting for a ThemisIQ specialist${late ? `, ${late} of them overdue` : ''}. Overdue first, then oldest:`,
    ...lines,
  ], { href: a.link, label: 'Open the queue' }, STAFF_FOOTER)
}
