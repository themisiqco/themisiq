// lib/email/layout.ts
//
// THE SHARED EMAIL SHELL (Oct 2026): masthead, content area, footer with the postal address. Pure: returns an HTML
// string. First used by the results email (lib/ghg/resultsEmail.ts); the other emails the app sends are listed for a
// follow-up in the report that introduced this file, and lib/assessmentEmail.ts still builds its own copy of the same
// masthead until it moves here.
//
// WHAT IT KEEPS FROM lib/assessmentEmail.ts, WHICH SET THE BRAND EMAIL (1 Oct 2026):
//   - the masthead image public/images/email/masthead.jpg (built by scripts/build-email-masthead.py, 1200 x 240,
//     rendered 600 x 120), on a #014782 cell so the alt text stays readable when images are blocked;
//   - light surfaces and literal hex from lib/brand.ts only (mail clients strip <style> and do not resolve var());
//   - GROUND around a 600px PAPER card with a LINE border; a GROUND footer under a LINE rule.
//
// EMAIL-CLIENT RULES IT FOLLOWS
//   - Tables for layout, every style inline. The card is width="600" with max-width:600px and width:100%, so it is
//     600px in Outlook (which ignores max-width) and shrinks on a phone.
//   - The image has explicit width and height attributes, display:block and border:0, and its alt text is styled
//     (colour, size, weight, font) for clients that show alt text in place of a blocked image.
//   - Fonts: the brand faces first (Literata for headings, Atkinson Hyperlegible Next for text), then fonts every
//     client has. NO WEB FONTS: no @font-face and no <link>, which Outlook ignores and some clients block. Outlook for
//     Windows uses only the FIRST font of a stack and falls back to Times New Roman when it is missing, so an mso-only
//     style block sets Georgia and Arial for it.
//   - Dark mode: the page declares color-scheme "light only", which Apple Mail honours (it shows the light design
//     rather than half-inverting it). Clients that force their own inversion (Gmail apps, Outlook) invert the light
//     surfaces; every pair here keeps its contrast under that, and the masthead is a dark image either way.
//   - A hidden preheader, so the inbox preview line is the email's own first sentence and not the alt text.
//
// ⚠️ NO EM DASHES in anything this file writes.

import { INK, INK_MUTED, PAPER, GROUND, LINE, ON_DARK } from '../brand'
import { SITE_ORIGIN } from '../siteOrigin'

export const EMAIL_POSTAL_ADDRESS = 'ThemisIQ, 11 Oak Drive, Niagara-on-the-Lake, ON L0S 1J0, Canada.'

/** The masthead's own fill, sampled from the image: shown only when images are blocked. Not a brand colour. */
export const EMAIL_MASTHEAD_FALLBACK = '#014782'
export const EMAIL_MASTHEAD_IMAGE = { src: `${SITE_ORIGIN}/images/email/masthead.jpg`, width: 600, height: 120, alt: 'ThemisIQ' } as const

export const EMAIL_FONT_TEXT = "'Atkinson Hyperlegible Next',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
export const EMAIL_FONT_DISPLAY = "Literata,Georgia,'Times New Roman',serif"

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function emailMasthead(): string {
  const m = EMAIL_MASTHEAD_IMAGE
  return `<tr><td bgcolor="${EMAIL_MASTHEAD_FALLBACK}" style="background:${EMAIL_MASTHEAD_FALLBACK};padding:0;line-height:0;font-size:0;">`
    + `<img src="${m.src}" width="${m.width}" height="${m.height}" alt="${m.alt}" style="display:block;width:100%;max-width:${m.width}px;height:auto;border:0;outline:none;text-decoration:none;color:${ON_DARK};font-size:20px;font-weight:bold;line-height:1.2;font-family:${EMAIL_FONT_TEXT};">`
    + `</td></tr>`
}

export type EmailShellInput = {
  /** The <title>, usually the subject. */
  title: string
  /** The inbox preview line. Plain text. */
  preheader?: string
  /** The content area's HTML, already escaped by the caller. */
  contentHtml: string
  /** Footer lines after the postal address, plain text; each is escaped here. */
  footerLines?: string[]
  /** Extra footer HTML, for a link the caller builds (L6: the marketing unsubscribe link). */
  footerExtraHtml?: string
}

export function emailShell(i: EmailShellInput): string {
  const footer = [EMAIL_POSTAL_ADDRESS, ...(i.footerLines ?? [])].map(esc).join(' ')
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(i.title)}</title>
<!--[if mso]><style>body,table,td,p,a,span,div{font-family:Arial,sans-serif !important;}.email-display{font-family:Georgia,serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${GROUND};color:${INK};font-family:${EMAIL_FONT_TEXT};-webkit-text-size-adjust:100%;">
${i.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${GROUND};">${esc(i.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${GROUND}" style="background:${GROUND};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="width:100%;max-width:600px;background:${PAPER};border:1px solid ${LINE};border-radius:12px;border-collapse:separate;overflow:hidden;">
${emailMasthead()}
<tr><td style="background:${PAPER};padding:28px 28px 8px;font-family:${EMAIL_FONT_TEXT};color:${INK};">
${i.contentHtml}
</td></tr>
<tr><td style="background:${GROUND};padding:16px 28px 20px;border-top:1px solid ${LINE};font-family:${EMAIL_FONT_TEXT};">
<p style="margin:0;font-size:12px;line-height:1.6;color:${INK_MUTED};">${footer}</p>${i.footerExtraHtml ?? ''}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
