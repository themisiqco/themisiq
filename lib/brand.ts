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
