/**
 * ONE INVARIANT — a determination's standard_version equals its assessment's — and everything the
 * client needs to speak about it: the two errcodes 20260851 raises, the sentences each refusal
 * becomes, and the classification the edit screen locks on.
 *
 * ⚠️ ONE ERRCODE, TWO READINGS, AND THAT IS WHY determinationSaveMessage TAKES A WRITER. PT409
 * reaches two screens for different reasons, and one of the two obvious pieces of advice is wrong
 * on each:
 *
 *   preparer    worksheet/[id]/determine/page.tsx reads standard_version ONCE at load (:148) and
 *               sends it back on every save. If the assessment was edited since, the page is
 *               sending a version that is no longer current. RELOADING FIXES IT.
 *
 *   contributor impact/[token]/page.tsx never sends a version — impact_save_determination derives it
 *               per call (20260840:332). But its ON CONFLICT DO UPDATE omits standard_version
 *               (20260840:409-418), so a row already started keeps the version it was first written
 *               under. RELOADING DOES NOT FIX IT: impact_get would return the new version and the
 *               row would still carry the old one. Telling them to reload would be a loop with no
 *               exit.
 *
 * ⚠️ AND THE CONTRIBUTOR'S REMEDY ONLY BECAME TRUE IN THE SAME COMMIT AS 20260851 §3. Before it, the
 * edit screen locked the version whenever determinations existed and omitted the column from its
 * patch (edit/page.tsx:100), so "tell the lead, they can correct it" named something no path in the
 * application could do. classifyVersionLock's `repairable` case and §3's permission for a repairing
 * change are what make that sentence honest. If either is ever removed, this message is a lie again.
 */

import { isStandardVersion, type StandardVersion } from '../materiality'

/**
 * ⚠️ THESE CONSTANTS AND THE MIGRATION'S `using errcode` ARE BOUND BY NOTHING BUT THIS COMMENT.
 * vitest has no database, so no test here can prove they still match — the test file asserts the
 * literals, which catches an edit on this side and cannot catch one on the other. If the SQL
 * changes, this changes in the same commit. Both raised in 20260851.
 */
export const DETERMINATION_VERSION_ERRCODE = 'PT409'
export const ASSESSMENT_VERSION_ERRCODE = 'PT412'

export type DeterminationWriter = 'preparer' | 'contributor'

/** Structural, not PostgrestError: this is what both an .upsert() and an .rpc() failure carry. */
export type SaveError = { code?: string | null; message?: string | null }

/**
 * ⚠️ NOT PADDING. A PostgrestError with an empty message would otherwise render as a blank error
 * box — a failure that looks like nothing happened. An empty result is a result.
 */
const NO_REASON =
  'It was not saved, and the server gave no reason. Nothing is recorded — try again, and tell us if '
  + 'it keeps happening.'

const PREPARER =
  'The ESRS version this assessment is prepared under has changed since this page was opened. Your '
  + 'answer was not saved, because it would have been recorded against the version the page loaded '
  + 'with. Reload the page and enter it again.'

const CONTRIBUTOR =
  'Your answer was not saved. This assessment now states a different version of the ESRS standards '
  + 'from the one your part was set up under, and the two have to agree before determinations can '
  + 'be recorded. Tell whoever sent you this link — they can correct it on the assessment itself. '
  + 'Reloading this page will not clear it.'

const ASSESSMENT_STALE =
  'The ESRS version was not changed. This assessment already holds recorded determinations keyed to '
  + 'the version it currently states, so moving it would leave that work behind. This page was '
  + 'showing an earlier state — reload it to see what is actually recorded.'

/** Everything else returns the server's own sentence: a ¶41 refusal says it better than a wrapper. */
function verbatim(err: SaveError): string {
  const own = err.message?.trim()
  return own ? own : NO_REASON
}

export function determinationSaveMessage(err: SaveError, writer: DeterminationWriter): string {
  if (err.code === DETERMINATION_VERSION_ERRCODE) {
    return writer === 'preparer' ? PREPARER : CONTRIBUTOR
  }
  return verbatim(err)
}

export function assessmentSaveMessage(err: SaveError): string {
  if (err.code === ASSESSMENT_VERSION_ERRCODE) return ASSESSMENT_STALE
  return verbatim(err)
}

// ─────────────────────────────────────────────────────────────────────────────
// The lock
// ─────────────────────────────────────────────────────────────────────────────

/** What the edit screen reads: the assessment's stated version, and what its determinations carry. */
export type CarriedVersions = {
  /** materiality_assessments.standard_version as STORED — never the form's current value. */
  stated: string | null
  /** DISTINCT standard_versions across this assessment's determinations. Empty means none exist. */
  carried: string[]
  determinations: number
  /**
   * ⚠️ THE READ ITSELF FAILED — PASSED, NOT INFERRED. A transient network error and inconsistent
   * stored data are different facts and the customer is owed different sentences: one says reload,
   * the other asks them to contact us. Encoding the failure as a fake count (the first draft passed
   * `det.error ? 1 : rows.length`) told someone whose assessment was empty and whose request merely
   * dropped that their data needed looking at on our side.
   */
  readFailed?: boolean
}

/**
 * ⚠️ VERSIONS, NOT A COUNT. A count answers "may this change?" and nothing else. The distinct
 * versions answer the question that actually matters when they disagree — WHICH version the work is
 * under — and that is the only value it is ever safe to offer.
 */
export type VersionLock =
  /** No determinations. Free choice. */
  | { kind: 'free' }
  /** Determinations exist and agree with the assessment. The version cannot change at all. */
  | { kind: 'agrees'; determinations: number }
  /** They all carry ONE version, and it is not the assessment's. That version, and only it, is offered. */
  | { kind: 'repairable'; determinations: number; to: StandardVersion; stated: string | null }
  /** More than one version, or one that is not a known version. Nothing can satisfy them all. */
  | { kind: 'unrepairable'; determinations: number; carried: string[] }
  /** The determinations could not be read. Locked, but nothing is known to be wrong. */
  | { kind: 'unknown' }

export function classifyVersionLock(d: CarriedVersions): VersionLock {
  /**
   * ⚠️ FIRST, AND SEPARATE FROM `unrepairable`. Both lock the control — failing closed is right,
   * because unlocking on a state that could not be read is unlocking on the assessment we know
   * least about. What differs is what the customer is told: `unknown` is our page failing and says
   * reload; `unrepairable` is their data disagreeing and asks them to write to us. Collapsing the
   * two would send someone to contact support about a dropped request.
   */
  if (d.readFailed) return { kind: 'unknown' }

  if (d.carried.length === 0) {
    /**
     * ⚠️ AND THIS ONE IS NOT `unknown`. standard_version is NOT NULL on the determinations table, so
     * rows that carry no version cannot exist: reaching here with determinations > 0 and nothing
     * carried is inconsistent stored data, not a failed read. The read SUCCEEDED and returned
     * something impossible.
     */
    if (d.determinations > 0) {
      return { kind: 'unrepairable', determinations: d.determinations, carried: [] }
    }
    return { kind: 'free' }
  }

  if (d.carried.length > 1) {
    return { kind: 'unrepairable', determinations: d.determinations, carried: d.carried }
  }

  const only = d.carried[0]
  if (only === d.stated) return { kind: 'agrees', determinations: d.determinations }

  /**
   * ⚠️ OFFERED ONLY IF IT IS A VERSION THE PRODUCT KNOWS. A carried value outside StandardVersion
   * cannot be rendered as a choice, and offering the raw string would put an unvalidated database
   * value into the payload the screen writes back.
   */
  if (isStandardVersion(only)) {
    return { kind: 'repairable', determinations: d.determinations, to: only, stated: d.stated }
  }
  return { kind: 'unrepairable', determinations: d.determinations, carried: d.carried }
}
