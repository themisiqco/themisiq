/**
 * The shape materiality_finalise_readiness returns (migration 20260850), and the one piece of
 * formatting the finalise card needs.
 *
 * ⚠️ NOTHING HERE RECOMPUTES `ready`, AND NOTHING THAT IMPORTS THIS MAY EITHER. The whole purpose
 * of 20260850 is that the button's enabled state and the RPC's refusal come from ONE query:
 * materiality_finalise and materiality_finalise_readiness both call materiality_finalise_scope and
 * materiality_finalise_outstanding, so they cannot disagree. A second copy of the rule in
 * TypeScript — `outstanding_count === 0`, say — would put that back, and NO TEST COULD CATCH IT:
 * vitest has no database and this repo has no schema-derived types, so a TypeScript copy cannot be
 * bound to the SQL one. Read `ready`. Read `reason`. Derive neither.
 */

import { formatReportDate } from '../reportDates'

/**
 * The closed discriminant. The screen switches on this rather than deducing which card to draw
 * from the counts — deducing would reproduce the RPC's precedence (version, then requirements,
 * then scope, then outstanding) in a second place.
 */
export type FinaliseReason =
  | 'version_not_stated'
  | 'no_requirements_for_version'
  | 'no_scope'
  | 'outstanding_determinations'

/** The latest finalisation, or null when the assessment has never been finalised. */
export type FinalisationLatest = {
  version: number
  finalised_at: string
  standard_version: string | null
}

export type Readiness = {
  ready: boolean
  /** Null when ready is true. */
  reason: FinaliseReason | null
  /** The refusal's own sentence, verbatim, so a stale click says the same words. */
  message: string | null
  outstanding: { subtopic_code: string; direction: string }[]
  outstanding_count: number
  scope_count: number
  standard_version: string | null
  requirements_available: number
  /** ⚠️ NULL when never finalised, never a version-0 stub. The two are different facts. */
  latest: FinalisationLatest | null
}

/**
 * The status line for a finalised assessment — "Finalised 22 August 2026", or
 * "Version 2 · finalised 5 September 2026" once there has been more than one.
 *
 * ⚠️ VERSION 1 DOES NOT SAY "Version 1", DELIBERATELY. A single finalisation is just "finalised";
 * printing a version number on it invites the reader to wonder what the other versions are. The
 * number earns its place only once a second one exists, which is also the only moment it carries
 * information.
 *
 * ⚠️ AN UNREADABLE finalised_at DOES NOT SUPPRESS THE STAMP. materiality_finalisations.finalised_at
 * is `timestamptz not null`, so this should not arise — but if it ever did, dropping the whole
 * status line would hide the fact that the assessment WAS finalised, which is the more important
 * of the two things being said. The raw value is printed instead, which looks wrong and is
 * therefore reportable, where a missing chip would look like "never finalised".
 *
 * Null when there is no finalisation. Never ''.
 */
export function finalisationStamp(latest: FinalisationLatest | null | undefined): string | null {
  if (!latest || typeof latest.version !== 'number') return null
  const when = formatReportDate(latest.finalised_at) ?? latest.finalised_at
  return latest.version > 1
    ? `Version ${latest.version} · finalised ${when}`
    : `Finalised ${when}`
}
