// lib/ghg/uploadRefusal.ts
//
// What a refused upload says (ENF1, Oct 2026). Since ENF1 the storage policy "Users can upload own documents" on the
// source-documents bucket requires an active GHG plan (public.has_active_entitlement('ghg')) as well as the user's
// own folder, so an expired or never-bought account's upload is refused by Postgres row-level security. The wizard
// never builds a path outside the user's folder, so a row-level security refusal there means the plan check.
//
// The message states the observed refusal and what it needs, not a guess at anything else. Every other storage
// failure keeps the wording it always had: the file name, the storage error verbatim and "Please try again."

export const UPLOAD_NEEDS_ACTIVE_PLAN = 'Uploading documents needs an active GHG plan.'

/** The slot's note for a customer whose plan has ended: uploads are off, the documents already there are not. */
export const UPLOADS_OFF_EXPIRED = `${UPLOAD_NEEDS_ACTIVE_PLAN} Renew to upload more. The documents already here stay readable.`

/**
 * Deleting is gated the same way (L0 amendment): the DELETE policy on source-documents also needs an active plan, so
 * the evidence behind an inventory that can no longer be saved stays exactly as it was (ISO 14064-3 data trail).
 * Shown in place of the Remove control, and when a removal is attempted without an active plan.
 */
export const DOCUMENTS_KEPT_INACTIVE = 'Documents stay as they were while your plan is inactive.'

/**
 * A Storage remove() that RLS refuses does not always come back as an error: Postgres filters the rows out, nothing
 * is deleted, and the call can succeed with an empty list. So "no error" is not "deleted". This compares what was
 * asked for with what Storage reports removing.
 */
export function removedAll(requested: number, removed: unknown[] | null | undefined): boolean {
  return (removed?.length ?? 0) >= requested
}

/** True for the refusal ENF1's policy produces: Postgres row-level security, which Storage reports as a 403. */
export function isPolicyRefusal(error: { message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!error) return false
  return /row-level security/i.test(error.message ?? '') || String(error.statusCode ?? '') === '403'
}

export function uploadFailureMessage(fileName: string, error: { message?: string; statusCode?: string | number }): string {
  return isPolicyRefusal(error)
    ? `${fileName} didn’t upload. ${UPLOAD_NEEDS_ACTIVE_PLAN}`
    : `${fileName} didn’t upload: ${error.message}. Please try again.`
}
