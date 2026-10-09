// lib/ghg/versionWords.ts
//
// T16: THE WORDS FOR A SAVED VERSION, on every surface that names one: the verifier page, the customer's list of
// verifier links and the assurance PDF cover. One copy each, so the three surfaces cannot word the same version
// differently. Pure; dates in words (T10c), times in UTC.

import { isoDateInWords } from './dateWords'

/** A timestamp's UTC date in words; '' when it is missing or not a timestamp. */
function utcDate(at: string | null | undefined): string {
  const d = at ? new Date(at) : null
  return d && !Number.isNaN(d.getTime()) ? isoDateInWords(d.toISOString().slice(0, 10)) : ''
}

export type VerifierVersion = { version_no: number; saved_at: string; shared_at: string | null; shared_by_customer: boolean }

/**
 * "Version {n}, saved on {date} at {hh:mm} UTC." from the VERSION's own saved_at (ghg_inventory_versions.saved_at).
 * THE SAME LINE on the assurance PDF cover and the verifier page (T16 review, 9 Oct 2026), so one version reads alike on
 * both. A reused version keeps the saved_at of the snapshot that wrote it, which can be older than the inventory's
 * latest save: the PDF prints that save on its own line (savedAtLine), never in place of this one.
 */
export function versionSavedLine(versionNo: number, savedAt: string | null | undefined): string | null {
  const d = savedAt ? new Date(savedAt) : null
  if (!d || Number.isNaN(d.getTime())) return null
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `Version ${versionNo}, saved on ${utcDate(savedAt)} at ${hh}:${mm} UTC.`
}

/** The verifier page's lines for the version their link shows: the version line, then when it was shared (ruling B). */
export function verifierVersionLines(v: VerifierVersion): [string, string] {
  const shared = utcDate(v.shared_at) || 'a date not recorded'
  const version = versionSavedLine(v.version_no, v.saved_at) ?? `Version ${v.version_no}. The time it was saved was not recorded.`
  if (v.shared_by_customer) return [version, `Shared with you on ${shared}.`]
  // Pinned by the T16 migration, not by the customer: say so, rather than claim a share nobody made.
  return [version, `This link was set to show it on ${shared}, when verifier links began showing a saved version of the inventory instead of the live one.`]
}

/** Shown to a verifier when the inventory has been saved with changes since the version they were shared. */
export const NEWER_VERSION_NOTICE =
  'A newer version of this inventory has been saved since this version was shared with you. This page shows the version shared with you. Ask the company to share the latest version if you need it.'

/** A quote from a bill that has been deleted since the version was saved: still shown, with no link. */
export const DELETED_FILE_QUOTE_SUFFIX = '(file deleted)'

/** The customer's line beside each verifier link (ruling B). */
export function grantVersionLine(versionNo: number | null | undefined, sharedAt: string | null | undefined): string {
  if (!versionNo) return 'No saved version recorded for this link.'
  const shared = utcDate(sharedAt)
  return shared ? `Version ${versionNo}, shared on ${shared}` : `Version ${versionNo}`
}

