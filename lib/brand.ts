// lib/brand.ts
// The ThemisIQ palette as literal hex, for the two contexts that cannot read a CSS custom
// property or a Tailwind class.
//
// ⚠️ APP CODE MUST NOT IMPORT THIS. A React component, a page, a layout — anything the browser
// styles — uses the CSS tokens or the Tailwind utilities generated from them
// (bg-brand, text-ink-muted, border-line, …). Importing hex here instead re-creates by hand the
// drift the token layer exists to end, and it does it invisibly: the value is right on the day it
// is written and silently stale afterwards.
//
// THE TWO CONTEXTS THAT LEGITIMATELY NEED IT:
//   1. EMAIL HTML. Gmail, Outlook and the rest strip <style> blocks, do not resolve var() and have
//      no Tailwind. Every colour in an email must be a literal hex on a style="" attribute.
//      Call sites: app/api/survey-invite, supplier-invite, impact-invite, order/quote-request,
//      webhooks/stripe.
//   2. PDF GENERATION. jsPDF draws to a canvas, not a DOM. doc.setTextColor() takes a colour value,
//      never a CSS variable. Call sites: lib/pdf/layout.ts, lib/assurancePdf.ts,
//      lib/materiality/boardReportPdf.ts.
//
// ⚠️ THESE VALUES MUST STAY IN SYNC WITH app/styles/themisiq-tokens.css, WHICH IS THE AUTHORITY.
// They were extracted from that file by parsing it, not retyped, so this file started correct.
// Nothing keeps it correct: there is no build step comparing the two, and a mismatch produces an
// email or a PDF in last season's colours while every screen is right — visible only to whoever
// holds both at once. If you change a --color-* value there, change it here in the same commit.
//
// Uppercase hex throughout, exactly as the CSS declares it.

/* ---- Brand ------------------------------------------------------------- */
export const BRAND       = '#095C6B'   // deep teal, 7.6:1 on white
export const BRAND_HOVER = '#0C7385'
export const BRAND_WASH  = '#D7EFF6'
export const BRAND_LINE  = '#9FCBD6'

/* ---- Ink --------------------------------------------------------------- */
export const INK       = '#151A1D'   // primary text,   17.5:1 on white
export const INK_2     = '#3B474D'   // secondary text,  9.6:1 on white
export const INK_MUTED = '#5A686E'   // labels, captions, 5.8:1 on white

/* ---- Surfaces ---------------------------------------------------------- */
export const PAPER   = '#FFFFFF'   // data tables, report canvas
export const GROUND  = '#F7F8F8'   // app background
export const SURFACE = '#FCFCFC'   // raised panel
export const SUNKEN  = '#EDEFF0'   // wells, inactive tabs

/* ---- CTA band ----------------------------------------------------------- */
// The light replacement for a filled dark panel. Ink 13.6:1 on it, brand 5.9:1.
export const BAND      = '#CCE7EF'
export const BAND_LINE = '#A8D2DD'

/* ---- Lines ------------------------------------------------------------- */
export const LINE        = '#D7DDDF'
export const LINE_STRONG = '#AAB4B8'

/* ---- Reversed text ------------------------------------------------------ */
// ⚠️ Off-white, never #FFF. Pure white haloes against dark and is the usual cause of type that
// looks blurred at reversed polarity. This matters more in a PDF than on screen.
export const ON_DARK       = '#EAEDEE'
export const ON_DARK_MUTED = '#B2BDC1'

/* ---- Module hues — wayfinding only, never the brand --------------------- */
// One accent per module, each with its wash. These identify WHICH module a surface belongs to;
// they are not brand colours and must not stand in for BRAND.
export type ModuleHue = { readonly color: string; readonly wash: string }

/* ---- State ------------------------------------------------------------- */
/**
 * ⚠️ AN EXTRACTION FROM --color-module-climate, NOT A NEW PALETTE. Until 25 Sep 2026 the Climate Risk
 * module hue was also the platform's warning colour: 273 of its 302 uses were warnings rather than
 * module identity, and three fallbacks in the token layer read
 * `var(--tq-state, var(--color-module-climate))`. Nothing renders differently for this change; the point
 * is that a palette swap can now give Climate Risk a new hue without recolouring every warning.
 *
 * ⚠️ app/api/assessment/submit/route.ts HARDCODES #A94E0D in an email severity map and should read
 * STATE_WARN from here instead. docs/backlog.md carries it; the -error, -info and -ok values are
 * likewise still hardcoded at about a hundred call sites, which is a later pass.
 */
export const STATE_WARN        = '#A94E0D'   // caution, incomplete, 5.6:1 on white
export const STATE_WARN_WASH   = '#FBE7DD'
export const STATE_ERROR       = '#B91C1C'   // failed, invalid,     6.1:1
export const STATE_ERROR_WASH  = '#FEE5E6'
export const STATE_INFO        = '#0C447C'   // neutral notice,      8.6:1
export const STATE_INFO_WASH   = '#E6F1FB'
export const STATE_OK          = '#0F6E56'   // complete, passed,    5.0:1
export const STATE_OK_WASH     = '#E1F5EE'

/* ---- Scale ------------------------------------------------------------- */
/**
 * A value on an ordered axis: risk severity, IPCC warming, materiality, persistence.
 *
 * ⚠️ ONE MEMBER, DELIBERATELY. `low` is --color-ink-muted and already has a token. `high` has TWO
 * values in use, #B91C1C and #A32D2D, which are 1.09:1 apart and read as one colour, so naming either
 * would move a pixel on the other scale. docs/backlog.md carries that decision.
 *
 * ⚠️ ITS FOUR GROUNDS ARE --color-paper #FFFFFF (5.55), --color-ground #F7F8F8 (5.22), SCALE_MID_WASH
 * (5.06) and SCALE_GAP_WASH (5.17), all clearing AA body. lib/tokenContrast.test.ts asserts them by
 * token name. #f8f7f5 is NOT paper — it is ACCENT.neutral.wash — and an earlier draft of this comment
 * said otherwise.
 *
 * ⚠️ SCALE_MID_WASH AND ACCENT.amber.wash HOLD THE SAME VALUE AND STAY SEPARATE, so one family can
 * move without dragging the other. SCALE_GAP_WASH is #FDF6EC and is NOT interchangeable with it: the
 * N/A band is a data gap scored null rather than a middling finding, and its ground is what says so.
 */
export const SCALE_MID      = '#A94E0D'   // 5.06:1 on SCALE_MID_WASH, 5.55:1 on --color-paper #FFFFFF
export const SCALE_MID_WASH = '#FEF3E2'
export const SCALE_GAP_WASH = '#FDF6EC'

/* ---- Accent ------------------------------------------------------------ */
/**
 * Telling one category from another: framework chips, questionnaire sections, card accents, swatches.
 *
 * ⚠️ NO SEMANTICS. Named by hue because these mean nothing. Three of the six share a value with a state
 * token (green/ok, blue/info, red/error) and one with a module hue's colour (amber, #A94E0D, though not
 * its wash). Before 25 Sep 2026 they WERE those tokens, so a category accent and a state claim were one
 * value and neither could move without the other.
 *
 * ⚠️⚠️ LOAD-BEARING. Read lib/ghg/engine.ts:1508-1526 before changing one: a framework colour is chosen
 * against the other five by HUE SEPARATION, and two candidates have already been measured and reversed.
 * The token layer's own comment carries the full account.
 *
 * ⚠️ #7425e3, the retired brand violet, is NOT a member. It has 32 live uses across 22 files including
 * six email routes; adopting it here would make it permanent. That belongs to the palette swap.
 */
export const ACCENT = {
  green:   { color: '#0F6E56', wash: '#E1F5EE' },  // hue 162
  blue:    { color: '#0C447C', wash: '#E6F1FB' },  // hue 210
  red:     { color: '#B91C1C', wash: '#FCEBEB' },  // hue   0
  amber:   { color: '#A94E0D', wash: '#FEF3E2' },  // hue  24
  magenta: { color: '#AF3790', wash: '#F9E6F2' },  // hue 313
  neutral: { color: '#555553', wash: '#f8f7f5' },  // hue  60
} as const
export type AccentKey = keyof typeof ACCENT

export const MODULE = {
  ghg:     { color: '#095C6B', wash: '#D7EFF6' },  // GHG Emissions
  cbam:    { color: '#1C5EAA', wash: '#E6EBFC' },  // CBAM
  deals:   { color: '#754CAA', wash: '#F0E8F8' },  // Deals & Investment
  supply:  { color: '#AF3790', wash: '#F9E6F2' },  // Supply Chain
  cyber:   { color: '#A41A3B', wash: '#FEE5E6' },  // Cyber Governance
  climate: { color: '#A94E0D', wash: '#FBE7DD' },  // Climate Risk
  people:  { color: '#7B630D', wash: '#F3EADA' },  // People & Workforce
  ai:      { color: '#136C3D', wash: '#DEEFE3' },  // AI Governance
} as const satisfies Record<string, ModuleHue>

export type ModuleHueKey = keyof typeof MODULE
