// lib/billReview/readingWords.ts
//
// BR6: what a Bill Review customer reads about how their bills are read. Q1 (ruled 10 Oct 2026): specialist reading
// is by request only, so the reading is shown, never chosen, and the customer asks for a change by email. Plain
// language, no em dash. Dates in words (T10c), in Toronto time.

import { isoDateInWords } from '../ghg/dateWords'
import { torontoParts } from './businessDays'
import type { BillReviewReading } from '../pricing'

/** Where a customer asks for specialist reading (Q1). One copy: the address is not typed again elsewhere in BR. */
export const BILL_REVIEW_CONTACT_EMAIL = 'hello@themisiq.co'

export function readingLine(reading: BillReviewReading): string {
  return reading === 'human'
    ? 'Your bills are read by a ThemisIQ specialist, and you confirm each one. Within 2 business days.'
    : 'Your bills are read by AI, and you confirm each one.'
}

/**
 * The AI-read line's request (copy change, Lisa, 10 Oct 2026): "Prefer a ThemisIQ specialist to read them instead? Ask
 * us to switch. We'll send you a quote before anything changes." ASK_SPECIALIST is the link's text.
 */
export const ASK_SPECIALIST_LEAD = 'Prefer a ThemisIQ specialist to read them instead?'
export const ASK_SPECIALIST = 'Ask us to switch'
export const ASK_SPECIALIST_AFTER = 'We\u2019ll send you a quote before anything changes.'

/** The request email: the subject names the company and the reporting year, worded by reportingYearLabel (yearText). */
export function specialistMailto(companyName: string | null | undefined, yearText: string): string {
  const subject = `Specialist reading for ${companyName?.trim() || 'my inventory'}, ${yearText}`
  return `mailto:${BILL_REVIEW_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}

/** In place of a switch screen: what changed and when, once the reading has been changed by ThemisIQ (set_at). */
export function sinceLine(reading: BillReviewReading, setAt: string | null | undefined): string | null {
  const d = setAt ? new Date(setAt) : null
  if (!d || Number.isNaN(d.getTime())) return null
  const date = isoDateInWords(torontoParts(d).date)
  return reading === 'human'
    ? `Since ${date}, bills you upload here are read by a ThemisIQ specialist and are not sent to the AI. Bills uploaded before then keep their reading.`
    : `Since ${date}, bills you upload here are read by the AI, and you confirm each one. Bills already with our team stay with our team.`
}
