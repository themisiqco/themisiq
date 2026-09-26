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

// ── THE MARKETING WIDTHS ─────────────────────────────────────────────────────────────────────────
// Added 26 Sep 2026. Until then this file held ONE of the three forms of this claim, and the other two
// were string literals in two page files: a local const in app/climate-ghg/page.tsx (deduplicated
// WITHIN that file, because the spec row and a feature card each carried a copy) and an inline
// paragraph in app/page.tsx's trust section. Both carried comments saying they must be corrected
// together, which is a rule a comment cannot enforce across a file boundary — the exact failure
// lib/pdf/palette.ts records, where a rejection written in one module never reached the other.
//
// ⚠️ THREE WIDTHS OF ONE CLAIM, AND A SLOT NEEDING MORE DOES NOT INVENT A FOURTH FORM. Same rule as
// lib/sb261.ts, which was created to end four spellings of one posture. If a surface fits none of
// these, widen one here and let every consumer take the change.
//
// ⚠️ WHAT MAKES THE CLAIM TRUE IS THE NAMED MODULES AND THE WORD "SAVED". Both are load-bearing:
//   · NAMED MODULES. Seven audit triggers exist, verified live 17 Sep 2026, covering ghg_inventories,
//     ghg_entries, two cbam_* tables and three concierge_* tables. NOT scope3_inventories, not the
//     supply-chain registers, not the campaign tables, not any materiality table. The platform-wide
//     version of this claim — "every calculation and data point is logged with a full audit trail" —
//     was false, and CLAUDE.md records it.
//   · "SAVED CHANGE", not "every entry, edit and deletion", which was corrected on 17 Sep 2026. The
//     granularity is one row per SAVE. A reader told "every edit" would expect keystroke history.
// Neither may be dropped to shorten a line. If a slot is too narrow for the module names, it is too
// narrow for this claim and should use AUDIT_LOG_BASIS instead, which claims nothing about scope.

/**
 * The full form. The specification row and the feature card on app/climate-ghg/page.tsx.
 * Widest of the three: names the modules, the mechanism, the granularity and the read-only property.
 */
export const AUDIT_TRAIL_NOTE =
  'Every saved change to a GHG inventory, CBAM disclosure or concierge record is written to an audit '
  + 'log by a database trigger, not by the application — with the user, the timestamp and the row as it '
  + 'was before. It covers those modules, and it records each save rather than each keystroke. You can '
  + 'read your own entries; you cannot edit or delete them.'

/**
 * The homepage-length form, for app/page.tsx's trust section. Shorter, and it leads with the workings
 * rather than the log, because the trust section's job is the whole claim and not just the database.
 * It keeps the three module names and "each saved change" for the reason in the block above.
 */
export const AUDIT_TRAIL_NOTE_SHORT =
  'Every figure carries its factor citation and its workings. In the GHG, CBAM and concierge modules, '
  + 'each saved change is written to an audit log by a database trigger — who, when, and the row as it '
  + 'was before — and you can read your own entries but not alter them.'

