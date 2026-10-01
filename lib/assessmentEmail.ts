// lib/assessmentEmail.ts
// The two emails /api/assessment/submit sends: the visitor's Compliance Obligation Map, and the internal
// lead alert. Pure: HTML strings from the posted entries, no I/O. The route (app/api/assessment/submit/
// route.ts) keeps the guards and the sending; it cannot export these itself, because a Next.js route file
// may export only its HTTP handlers and config. Here they can be tested and previewed without sending.
//
// ⚠️ LITERAL HEX ONLY, AND ONLY FROM lib/brand.ts. Mail clients strip <style> and do not resolve var(), so
// every colour is a hex on a style="" attribute, read from the constants that mirror the token file.
//
// ⚠️ LIGHT SURFACES, NO GRADIENT (restyled 1 Oct 2026). The black header, summary, footer and alert header
// and the retired #7425e3/#1fb1ff/#64fe3e stripes are gone. Every text/background pair, measured:
//     INK on PAPER 17.54   INK_2 on PAPER 9.57   INK_MUTED on PAPER 5.77   BRAND on PAPER 7.62
//     INK on GROUND 16.48  INK_2 on GROUND 8.99  INK_MUTED on GROUND 5.42  BRAND on GROUND 7.16
//     INK on BAND 13.57    INK_2 on BAND 7.40    ⚠️ INK_MUTED on BAND is 4.46, BELOW 4.5: never used there
//     ON_DARK on BRAND 6.48 (step circles, primary button)
//     pills: #501313 on ACCENT.red.wash 12.62, STATE_ERROR on it 5.61, #633806 on ACCENT.amber.wash 9.12,
//            STATE_INFO on STATE_INFO_WASH 5.19, INK_MUTED on ACCENT.neutral.wash 5.39
//     table head and alternate rows: INK_MUTED on ACCENT.neutral.wash 5.39, INK on it 16.38
// app/api/assessment/submit/email.test.ts recomputes every one of these from the constants.

import { disclaimerParas } from './disclaimer'
import { OBLIGATIONS, resolveObligation, modulesHref, modulesPrice, modulesLabel, priceLabel } from './obligations'
import {
  BRAND, BRAND_LINE, INK, INK_2, INK_MUTED, PAPER, GROUND, LINE, BAND, BAND_LINE, ON_DARK,
  ACCENT, STATE_ERROR, STATE_WARN, STATE_INFO, STATE_INFO_WASH,
} from './brand'

// EVERY LINK IN AN EMAIL MUST BE ABSOLUTE. The hrefs lib/obligations.ts returns are relative, because
// the page renders them into its own document; dropped into an inbox they resolve against the mail
// client and go nowhere. This prefixes them, and states the host once.
export const SITE_URL = 'https://www.themisiq.co'

// THE MASTHEAD, ONE HOSTED IMAGE AT THE TOP OF BOTH EMAILS (1 Oct 2026): the aurora with the reversed logo
// keyed onto it, built by scripts/build-email-masthead.py into public/images/email/masthead.jpg (1200 x 240,
// rendered 600 x 120, 2x). It replaced a white header with the logo PNG on it.
//
// ⚠️ IF IMAGES ARE BLOCKED, THE ALT TEXT SITS ON MASTHEAD_FALLBACK. The cell's bgcolor is #014782, sampled
// from the masthead and used ONLY as that fallback fill: it is not a brand colour and appears nowhere else.
// The alt text is ON_DARK, 20px bold, on it (EMAIL_TEXT ratio in email.test.ts).
export const MASTHEAD_FALLBACK = '#014782'
export const EMAIL_MASTHEAD = { src: `${SITE_URL}/images/email/masthead.jpg`, width: 600, height: 120, alt: 'ThemisIQ' } as const
const masthead = `<tr><td bgcolor="${MASTHEAD_FALLBACK}" style="background:${MASTHEAD_FALLBACK};padding:0;line-height:0;font-size:0;">
    <img src="${EMAIL_MASTHEAD.src}" width="${EMAIL_MASTHEAD.width}" height="${EMAIL_MASTHEAD.height}" alt="${EMAIL_MASTHEAD.alt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:${ON_DARK};font-size:20px;font-weight:bold;line-height:1.2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  </td></tr>`

// Both emails are full documents that state their encoding: the alert had no <head>, and a client or
// browser that guessed Latin-1 showed "Â·" for every "·".
const head = (title: string) => `<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>`

// The formal Important Notice, in the footer as fine print. TEXT FROM lib/disclaimer.ts, UNCHANGED: it is
// kept in sync across every Category-A surface. Only its colours are set here: heading INK_2, body
// INK_MUTED, on GROUND (5.42:1).
const DISCLAIMER_HTML = `<p style="font-size:10px;font-weight:700;color:${INK_2};letter-spacing:0.06em;text-transform:uppercase;line-height:1.6;margin:0 0 6px;">Important Notice</p>`
  + disclaimerParas('screening').map(par => `<p style="font-size:10px;color:${INK_MUTED};line-height:1.6;margin:0 0 6px;">${par}</p>`).join('')

// ⚠️ A SEVERITY SCALE, SO IT READS THE STATE TOKENS. critical / high / medium / monitor is what the
// platform means by error / warn / info / muted. This is an EMAIL, so it cannot resolve a CSS custom
// property: lib/brand.ts exists for exactly this.
//
// ⚠️ #501313 AND #633806 STAY AS LITERALS, DELIBERATELY. They are darker-still text variants of the
// critical and high washes, used where the pill sets its own background, and no token holds either.
// docs/backlog.md carries them.
export const URGENCY_COLOR: Record<string, string> = {
  critical: STATE_ERROR, high: STATE_WARN, medium: STATE_INFO, monitor: INK_MUTED,
}
// ⚠️ high TAKES ACCENT.amber.wash AND NOT STATE_WARN_WASH; monitor takes ACCENT.neutral.wash, not SUNKEN;
// critical takes ACCENT.red.wash, not STATE_ERROR_WASH. Each plausibly-named constant held a DIFFERENT
// value from what this email had always used, and only printing both settled it.
export const URGENCY_BG: Record<string, string> = {
  critical: ACCENT.red.wash, high: ACCENT.amber.wash, medium: STATE_INFO_WASH, monitor: ACCENT.neutral.wash,
}
export const URGENCY_TEXT: Record<string, string> = {
  critical: '#501313', high: '#633806', medium: STATE_INFO, monitor: INK_MUTED,
}

/** An entry as /assess posts it. Loose on purpose: it arrives as JSON from a client that may be cached. */
export type PostedObligation = {
  name?: string; jurisdiction?: string; timing?: string; module?: string; urgency?: string; urgency_label?: string
  group?: string; obligationId?: unknown; covered?: unknown
}
export type ProfileRow = { q?: string; a?: string }

export type LeadEmailInput = {
  obligations: PostedObligation[]
  /** 'your company' when none was given: never show an absence marker to the person whose absence it is. */
  theirCompany: string
  /** Name and company, or the email address: what "Prepared for" names. */
  leadIdent: string
  date: string
}

const counts = (obligations: PostedObligation[]) => ({
  total: obligations.length,
  critical: obligations.filter(o => o.urgency === 'critical').length,
  high: obligations.filter(o => o.urgency === 'high').length,
})

/**
 * Next step 1's closing sentence, from the same counts the summary panel prints. Critical first, then high,
 * else nothing: a sentence pointing at a label no row carries would send the reader looking for it.
 */
export function urgentFirstSentence(critical: number, high: number): string {
  if (critical > 0) return ' Start with the ones marked IMMEDIATE ACTION.'
  if (high > 0) return ' Start with the ones marked HIGH PRIORITY.'
  return ''
}

// Grouped to MIRROR THE RESULTS PAGE. An entry with NO group (an older client, a cached page mid-deploy)
// is NOT dropped: it falls through to a third bucket that says the classification is missing.
const GROUP_HEADINGS: { key: string; title: string; sub: string }[] = [
  { key: 'regulatory', title: 'Regulatory / compliance', sub: 'Rules that apply to you, based on where you operate, your size and your sector.' },
  { key: 'market',     title: 'Market-driven',           sub: 'What your customers, investors and lenders are asking for, often because they have a reporting obligation of their own.' },
  { key: '__ungrouped', title: 'Not classified',          sub: 'These entries arrived without a group. They are listed so nothing is lost; check them against the online results.' },
]

// MODULE CELL: a priced link where the entry maps, plain text where it does not. MEMBERSHIP IS GUARDED:
// an id this build no longer holds falls back to `ob.module` as plain text rather than throwing and taking
// the whole email down. THE SAME RESOLUTION /assess USES, so the email and the page sell the same modules;
// `covered` is client-posted, and resolveObligation narrows it rather than trusting it.
function moduleCell(ob: PostedObligation): string {
  const id = ob.obligationId
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(OBLIGATIONS, id)) return ob.module ?? ''
  const o = resolveObligation(id as keyof typeof OBLIGATIONS, ob.covered)
  const link = `<a href="${SITE_URL}${modulesHref(o.modules)}" style="color:${BRAND};text-decoration:none;">${modulesLabel(o.modules)} · ${priceLabel(modulesPrice(o.modules))} →</a>`
  // The caveat travels with the link and price it qualifies, as on the page (today only CSRD's).
  return o.caveat ? `${link}<div style="font-size:11px;font-weight:400;color:${INK_2};line-height:1.5;margin-top:4px;">${o.caveat}</div>` : link
}

const cell = `border-bottom:1px solid ${LINE};vertical-align:top;`
const row = (ob: PostedObligation, i: number) => `
      <tr style="background:${i % 2 === 0 ? PAPER : ACCENT.neutral.wash}">
        <td style="padding:10px 14px;${cell}font-size:12px;font-weight:600;color:${INK};">
          ${ob.name}
          <div style="font-size:11px;font-weight:400;color:${INK_MUTED};margin-top:2px;">${ob.jurisdiction}</div>
        </td>
        <td style="padding:10px 14px;${cell}">
          <span style="font-size:10px;font-weight:700;color:${URGENCY_TEXT[ob.urgency ?? '']};background:${URGENCY_BG[ob.urgency ?? '']};padding:3px 8px;border-radius:99px;white-space:nowrap;">${ob.urgency_label}</span>
        </td>
        <td style="padding:10px 14px;${cell}font-size:12px;color:${INK_2};">${ob.timing}</td>
        <td style="padding:10px 14px;${cell}font-size:12px;color:${BRAND};font-weight:600;">${moduleCell(ob)}</td>
      </tr>`
// 'Obligation', not 'Regulation': this header sits over the Market-driven table too.
const th = (label: string) => `<th style="padding:8px 14px;text-align:left;font-size:10px;font-weight:600;color:${INK_MUTED};letter-spacing:0.06em;text-transform:uppercase;border-bottom:1px solid ${LINE};">${label}</th>`
const headerRow = `<tr style="background:${ACCENT.neutral.wash};">${th('Obligation')}${th('Priority')}${th('Timing')}${th('Module')}</tr>`

const step = (n: number, title: string, body: string, last = false) => `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:${last ? 24 : 14}px;"><tr>
      <td width="32" valign="top" style="padding-right:12px;"><div style="width:28px;height:28px;border-radius:50%;background:${BRAND};font-size:12px;font-weight:700;color:${ON_DARK};text-align:center;line-height:28px;">${n}</div></td>
      <td valign="top"><div style="font-size:13px;font-weight:600;color:${INK};margin-bottom:3px;">${title}</div><div style="font-size:12px;color:${INK_2};line-height:1.6;">${body}</div></td>
    </tr></table>`

const pill = (text: string, color: string, bg: string) =>
  `<span style="font-size:11px;font-weight:700;color:${color};background:${bg};padding:4px 12px;border-radius:99px;">${text}</span>`

// ⚠️ THE EMPTY STATE IS A RESULT, NOT A ZERO. With no obligations the summary read "We identified 0
// obligations that apply to your company", with three "0" pills over an empty "Your compliance obligations"
// heading. It now says what happened: nothing this assessment checks for matched. The counts sentence, the
// pills and the heading go; the footer stays, and the next steps take their own wording, because the usual
// three point at "the obligations above" and there are none.
export const EMPTY_HEADLINE = 'Your answers did not match any of the obligations this assessment checks for.'

export function buildLeadEmailHtml({ obligations, theirCompany, leadIdent, date }: LeadEmailInput): string {
  const { total, critical, high } = counts(obligations)
  const empty = total === 0
  const obligationRows = GROUP_HEADINGS.map(g => {
    const rows = g.key === '__ungrouped'
      ? obligations.filter(o => o.group !== 'regulatory' && o.group !== 'market')
      : obligations.filter(o => o.group === g.key)
    if (rows.length === 0) return ''
    return `
    <!-- Georgia is deliberate: a mail client cannot resolve var(--font-display), and web fonts do not load reliably in mail. -->
    <div style="font-size:13px;font-weight:600;color:${INK};font-family:Georgia,serif;margin:0 0 2px;">${g.title}</div>
    <div style="font-size:11px;color:${INK_MUTED};line-height:1.55;margin-bottom:8px;">${g.sub}</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;overflow:hidden;margin-bottom:18px;">
      ${headerRow}
      ${rows.map(row).join('')}
    </table>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
${head('Your ThemisIQ Compliance Obligation Map')}
<body style="margin:0;padding:0;background:${GROUND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GROUND};">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;border:1px solid ${LINE};">

  <!-- MASTHEAD: one image, the aurora and the logo -->
  ${masthead}

  <!-- DATE LINE: what the masthead used to carry on its right -->
  <tr><td style="background:${PAPER};padding:14px 32px;border-bottom:1px solid ${LINE};">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:11px;font-weight:600;color:${INK_MUTED};text-transform:uppercase;letter-spacing:0.07em;">Compliance Obligation Map</td>
      <td align="right" style="font-size:11px;color:${INK_MUTED};">${date}</td>
    </tr></table>
  </td></tr>

  <!-- SUMMARY: BAND with BAND_LINE edges. INK and INK_2 only: INK_MUTED is 4.46:1 on BAND. -->
  <tr><td style="background:${BAND};padding:28px 32px 24px;border-bottom:1px solid ${BAND_LINE};">
    <div style="font-size:11px;font-weight:600;color:${INK_2};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Prepared for ${leadIdent}</div>
    ${empty
    ? `<div style="font-size:22px;font-weight:400;color:${INK};line-height:1.25;font-family:Georgia,serif;">${EMPTY_HEADLINE}</div>`
    : `<div style="font-size:22px;font-weight:400;color:${INK};line-height:1.25;font-family:Georgia,serif;margin-bottom:10px;">We identified <span style="font-style:italic;">${total} ${total === 1 ? 'obligation' : 'obligations'}</span> that apply to ${theirCompany}.</div>
    <div style="font-size:13px;color:${INK_2};line-height:1.65;margin-bottom:20px;">${critical} ${critical === 1 ? 'requires' : 'require'} immediate action. ${high} ${high === 1 ? 'is' : 'are'} high priority. Review your full Compliance Obligation Map below.</div>
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="padding-right:8px;">${pill(`${critical} immediate`, STATE_ERROR, ACCENT.red.wash)}</td>
      <td style="padding-right:8px;">${pill(`${high} high priority`, URGENCY_TEXT.high, ACCENT.amber.wash)}</td>
      <td>${pill(`${total - critical - high} monitor`, INK_MUTED, ACCENT.neutral.wash)}</td>
    </tr></table>`}
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:${PAPER};padding:32px;">
    ${empty ? '' : `<div style="font-size:11px;font-weight:600;color:${INK_MUTED};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">Your compliance obligations</div>
    ${obligationRows}

    <div style="height:1px;line-height:1px;font-size:1px;background:${LINE};margin:28px 0;">&nbsp;</div>
`}
    <div style="font-size:11px;font-weight:600;color:${INK_MUTED};letter-spacing:0.1em;text-transform:uppercase;margin-bottom:16px;">Recommended next steps</div>
    ${empty
    // With nothing above, steps that point at "the obligations above" would point at nothing.
    ? `${step(1, 'Check again when things change', 'Thresholds and dates move, and a change in your size, markets or customers can bring a rule into scope. Run the assessment again when any of those change.')}
    ${step(2, 'Set up your account', 'Create an account and get your reporting ready before a customer, investor or lender asks.')}
    ${step(3, 'Book a free 30-minute consultation', 'An advisor will review your answers with you and suggest where to start.', true)}`
    : `${step(1, 'Start with what’s most urgent', `Each obligation above shows its timing and what it requires. Some have fixed dates, others apply now or arise when a customer or investor asks.${urgentFirstSentence(critical, high)}`)}
    ${step(2, 'Set up your account', 'Create an account and start work on the obligations above, at your own pace.')}
    ${step(3, 'Book a free 30-minute consultation', 'An advisor will review your obligations with you, help you prioritise by risk and effort, and suggest where to start.', true)}`}

    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding-right:10px;"><a href="${SITE_URL}/signup" style="display:inline-block;font-size:13px;font-weight:600;color:${ON_DARK};background:${BRAND};border:1px solid ${BRAND};padding:11px 24px;border-radius:8px;text-decoration:none;">Create your account</a></td>
          <td><a href="${SITE_URL}/advisory" style="display:inline-block;font-size:13px;font-weight:600;color:${BRAND};background:${PAPER};border:1px solid ${BRAND_LINE};padding:11px 24px;border-radius:8px;text-decoration:none;">Book a free consultation</a></td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- FOOTER: ground, a line rule above -->
  <tr><td style="background:${GROUND};padding:20px 32px;border-top:1px solid ${LINE};">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top"><div style="font-size:13px;font-weight:700;color:${INK};margin-bottom:3px;">ThemisIQ</div><div style="font-size:11px;color:${INK_MUTED};">Collect once, comply everywhere.</div><div style="font-size:11px;color:${INK_MUTED};margin-top:4px;"><a href="${SITE_URL}" style="color:${BRAND};text-decoration:none;">www.themisiq.co</a> · <a href="mailto:hello@themisiq.co" style="color:${BRAND};text-decoration:none;">hello@themisiq.co</a></div></td>
      <td align="right" valign="top"><div style="font-size:11px;color:${INK_MUTED};text-align:right;line-height:1.6;">You received this because you completed<br>the ThemisIQ Compliance Assessment.<br><a href="${SITE_URL}" style="color:${INK_MUTED};text-decoration:underline;">Unsubscribe</a></div></td>
    </tr></table>
  </td></tr>

  <!-- IMPORTANT NOTICE -->
  <tr><td style="background:${GROUND};padding:4px 32px 16px;">
    ${DISCLAIMER_HTML}
  </td></tr>

</table>
</td></tr></table>
</body></html>`
}

export type NotifyEmailInput = {
  obligations: PostedObligation[]
  profile: unknown
  date: string
  lead: { name: string; company: string; role: string; email: string }
}

// The visitor's answers, already resolved to display labels by the client. ABSENT IS NOT EMPTY: an older
// client sends no `profile` at all, and the alert says which rather than rendering a blank block.
function profileRows(profile: unknown): string {
  if (!Array.isArray(profile)) return `<div style="margin-top:16px;font-size:11px;color:${INK_MUTED};">Qualification profile not sent by the client: this submission predates the profile field, or the page was cached from an earlier deploy.</div>`
  if (profile.length === 0) return `<div style="margin-top:16px;font-size:11px;color:${INK_MUTED};">Qualification profile sent, but empty: the visitor reached the email gate without a recorded answer.</div>`
  return `
    <div style="font-size:11px;font-weight:600;color:${INK_MUTED};letter-spacing:0.06em;text-transform:uppercase;margin:16px 0 6px;">What they told us</div>
    <table width="100%" style="border:1px solid ${LINE};border-radius:6px;overflow:hidden;">
      ${(profile as ProfileRow[]).map((p, i) => `<tr style="background:${i % 2 === 0 ? PAPER : ACCENT.neutral.wash}"><td width="45%" style="padding:6px 10px;border-bottom:1px solid ${LINE};font-size:11px;color:${INK_MUTED};vertical-align:top;">${p.q}</td><td style="padding:6px 10px;border-bottom:1px solid ${LINE};font-size:11px;color:${INK};font-weight:600;vertical-align:top;">${p.a}</td></tr>`).join('')}
    </table>`
}

export function buildNotifyHtml({ obligations, profile, date, lead }: NotifyEmailInput): string {
  const { total, critical } = counts(obligations)
  const label = (t: string) => `<td width="140" style="font-size:12px;color:${INK_MUTED};font-weight:600;padding:4px 0;">${t}</td>`
  return `<!DOCTYPE html>
<html lang="en">
${head('New assessment lead')}
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${GROUND};padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${PAPER};border-radius:8px;overflow:hidden;border:1px solid ${LINE};">
  ${masthead}
  <tr><td style="background:${PAPER};padding:14px 20px;border-bottom:1px solid ${LINE};font-size:14px;font-weight:700;color:${INK};">New assessment lead · ${date}</td></tr>
  <tr><td>
  <div style="padding:20px;">
    <table width="100%" style="margin-bottom:16px;">
      <tr>${label('Name')}<td style="font-size:12px;color:${INK};font-weight:600;">${lead.name}</td></tr>
      <tr>${label('Company')}<td style="font-size:12px;color:${INK};">${lead.company}</td></tr>
      <tr>${label('Role')}<td style="font-size:12px;color:${INK};">${lead.role}</td></tr>
      <tr>${label('Email')}<td style="font-size:12px;color:${BRAND};">${lead.email}</td></tr>
    </table>
    <div style="background:${ACCENT.red.wash};border-radius:6px;padding:10px 14px;margin-bottom:16px;">
      <span style="font-size:13px;font-weight:700;color:${URGENCY_TEXT.critical};">${total} obligations identified · ${critical} requiring immediate action</span>
    </div>
    <table width="100%" style="border:1px solid ${LINE};border-radius:6px;overflow:hidden;">
      <tr style="background:${ACCENT.neutral.wash};">
        <th style="padding:6px 10px;text-align:left;font-size:10px;color:${INK_MUTED};font-weight:600;border-bottom:1px solid ${LINE};">Obligation</th>
        <th style="padding:6px 10px;text-align:left;font-size:10px;color:${INK_MUTED};font-weight:600;border-bottom:1px solid ${LINE};">Priority</th>
        <th style="padding:6px 10px;text-align:left;font-size:10px;color:${INK_MUTED};font-weight:600;border-bottom:1px solid ${LINE};">Timing</th>
      </tr>
      <!-- THE NAME IS NOT TRUNCATED: a statute name cut mid-word is worse than a table row that wraps. -->
      ${obligations.map(ob => `<tr><td style="padding:6px 10px;border-bottom:1px solid ${LINE};font-size:12px;font-weight:600;color:${INK};">${ob.name}</td><td style="padding:6px 10px;border-bottom:1px solid ${LINE};font-size:11px;font-weight:700;color:${URGENCY_COLOR[ob.urgency ?? ''] ?? INK_MUTED};">${ob.urgency_label}</td><td style="padding:6px 10px;border-bottom:1px solid ${LINE};font-size:11px;color:${INK_2};">${ob.timing}</td></tr>`).join('')}
    </table>
    ${profileRows(profile)}
  </div>
  </td></tr>
</table>
</body></html>`
}
