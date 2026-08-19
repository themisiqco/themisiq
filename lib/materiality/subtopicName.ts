/**
 * How a sub-topic's display name is resolved — one chain, used everywhere it is read.
 *
 * ⚠️ THE SNAPSHOT WINS WHERE IT EXISTS, AND THAT IS THE POINT OF THE ORDER.
 * materiality_impact_assignment_subtopics.short_name is the name the CONTRIBUTOR WAS ACTUALLY
 * ASKED, copied onto their assignment when it was created (20260838). It must not change if
 * mr_esrs_subtopic_display is later edited: a determination is evidence of a judgement about a
 * question, and re-labelling the question afterwards would silently restate what someone was asked.
 * The same argument 20260819 makes for the survey's question rows, one instrument along.
 *
 * ⚠️ THE FALLBACKS ARE FOR ROWS THAT NEVER HAD A SNAPSHOT — NOT A SUBSTITUTE FOR ONE.
 * The lead's own determinations are the case that forced this. A snapshot row is written only when
 * a sub-topic is ASSIGNED to a colleague, so an assessment where the lead does all the work has
 * zero rows in materiality_impact_assignment_subtopics — which is the common case for a customer
 * with no contributors, not an edge case. That is a legitimate state and it must not require a
 * self-assignment row to display correctly, so the read falls back rather than the write inventing
 * a row that means "assigned to nobody".
 *
 * THE CHAIN, and it deliberately mirrors impact_get's own coalesce (20260840):
 *
 *   1. the ASSIGNMENT snapshot     what this contributor was asked
 *   2. the ROUND snapshot          what the survey asked, for scope drawn from a linked round —
 *                                  frozen at the round, so equally stable
 *   3. mr_esrs_subtopic_display    ThemisIQ's house short name for this standard version
 *   4. mr_esrs_subtopics.label     the VERBATIM Appendix A label. Correct, and deliberately last:
 *                                  it is legal text rather than house copy, and reads as such
 *   5. null                        no name is known
 *
 * ⚠️ IT RETURNS null RATHER THAN THE CODE WHEN NOTHING IS KNOWN, and that is the defect this file
 * was written for. A resolver that returned the code let callers render `{name} {code}` as
 * "E1.1 E1.1" — a heading that looks like a rendering bug and is one. Returning null forces the
 * caller to decide, and subtopicHeading() below makes the right decision once instead of at each
 * call site.
 *
 * Pure: no React, no Supabase. The caller fetches; this decides.
 */

import { worksheetSubtopicHeading } from './severityScale'

/** Each source is a map of subtopic_code to whatever name that source holds. Any may be absent. */
export type SubtopicNameSources = {
  /** materiality_impact_assignment_subtopics.short_name */
  assignmentSnapshot?: Record<string, string | null | undefined>
  /** materiality_survey_questions.short_name, for scope inherited from a linked round */
  roundSnapshot?: Record<string, string | null | undefined>
  /** mr_esrs_subtopic_display.short_name for the assessment's standard_version */
  display?: Record<string, string | null | undefined>
  /** mr_esrs_subtopics.label — Appendix A verbatim */
  reference?: Record<string, string | null | undefined>
}

const firstNonEmpty = (...vals: (string | null | undefined)[]): string | null => {
  for (const v of vals) if (typeof v === 'string' && v.trim().length > 0) return v
  return null
}

/** The best known name for a sub-topic, or null when none of the sources holds one. */
export function resolveSubtopicName(
  code: string,
  sources: SubtopicNameSources,
): string | null {
  return firstNonEmpty(
    sources.assignmentSnapshot?.[code],
    sources.roundSnapshot?.[code],
    sources.display?.[code],
    sources.reference?.[code],
  )
}

/**
 * The full worksheet heading for a sub-topic: its name, the S1/S2 worksheet framing where the topic
 * has one, and the ESRS code — with the code shown ONCE.
 *
 * ⚠️ WHEN NO NAME IS KNOWN THE CODE STANDS ALONE. It is the honest rendering: the code IS the only
 * thing known about the sub-topic, and printing it twice claims a name that does not exist.
 */
export function subtopicHeading(
  code: string,
  topicCode: string,
  sources: SubtopicNameSources,
): { title: string; code: string | null } {
  const name = resolveSubtopicName(code, sources)
  return name === null
    ? { title: code, code: null }
    : { title: worksheetSubtopicHeading(name, topicCode), code }
}
