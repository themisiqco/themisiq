// lib/auditTrailNotice.ts
// SINGLE SOURCE OF TRUTH for the line above an audit trail, on the two surfaces a verifier reads:
// the assurance PDF (lib/assurancePdf.ts, page 5) and the GHG verifier page
// (app/verify/[token]/page.tsx, Audit Trail section). Same pattern, and same reason, as
// lib/verifierDocNotice.ts: one claim, several consumers, so the wordings cannot drift apart.
//
// ⚠️ "TAMPER-EVIDENT" WENT ON 17 SEP 2026. Both surfaces read "append-only, tamper-evident record".
// Evident IMPLIES DETECTION — that an alteration would show — and nothing here detects one: there is
// no hash chain over the rows, no signature on the export, no checksum a reader could recompute. A
// database superuser could change or remove a row and no surface would reveal it, so the word
// promised a property nobody could demonstrate to a verifier.
//   WHAT IS TRUE IS PREVENTION FOR PLATFORM USERS, NOT DETECTION, and that is what the line now says.
// Verified live 17 Sep 2026: audit_log has RLS enabled with one policy, audit_select_own
// (user_id = auth.uid()), and `authenticated` holds SELECT and nothing else — no INSERT, UPDATE,
// DELETE or TRUNCATE. The rows are written by a database trigger running as its owner, so the entry
// is recorded even when the application is bypassed.
//   TO PUT THE WORD BACK, build the mechanism first: a hash chain over the rows, or a signed export
// a reader can verify independently. That is schema and code, not copy. Do not restore the wording
// ahead of it.

/** What the log's append-only property actually rests on. No claim of detection. */
export const AUDIT_LOG_BASIS =
  'append-only: written by a database trigger, and no signed-in account can modify or delete an entry'

/** "12 changes logged · append-only: …". Singular at 1, and 0 is a real answer, not a blank. */
export function auditTrailLine(changeCount: number): string {
  return `${changeCount} change${changeCount === 1 ? '' : 's'} logged · ${AUDIT_LOG_BASIS}`
}
