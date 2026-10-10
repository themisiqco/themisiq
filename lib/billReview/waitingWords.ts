// lib/billReview/waitingWords.ts
//
// BR4: what the customer reads about a bill with the Bill Review team. Plain language, no em dash. Dates in words
// (T10c). One copy each, for the document list and the figure.

import { isoDateInWords } from '../ghg/dateWords'
import { COVERAGE_MESSAGE } from '../ghg/engine'
import { formatActivity } from '../ghg/workingsCells'
import { torontoParts } from './businessDays'

/**
 * A waiting bill, and a figure waiting on one: the expected date, or that it is not set (never a guessed date). Past
 * the expected date in Toronto (Q7, ruled 10 Oct 2026), it is running late; it never falls back to the AI.
 */
export function withTeamLine(expectedBy: string | null | undefined, now: Date = new Date()): string {
  if (!expectedBy) return 'With our team. The expected date is not set yet.'
  if (isLate(expectedBy, now)) return `Running late. We expected this by ${isoDateInWords(expectedBy)} and are still reading it.`
  return `With our team, expected by ${isoDateInWords(expectedBy)}.`
}

/** Q7: late once Toronto's date is after the expected date (the expected day itself is on time). */
export const isLate = (expectedBy: string, now: Date = new Date()) => torontoParts(now).date > expectedBy

/** The submission did not land. The page sends it again the next time the inventory is opened. */
export const SUBMIT_FAILED_NOTE = 'Not yet sent to our team: the request did not complete. It is sent again the next time this inventory is opened. It is not sent to the AI.'

/** A specialist found no figure they could read: the bill's note, the same sentence as the export block (BR7 ruling 4). */
export const unreadableNote = (file: string, note: string | null | undefined) => COVERAGE_MESSAGE.reading_unreadable(file, note)

/** A correction that arrived after the customer acted on the reading it corrects. Not merged (BR4 ruling 5). */
export const correctionNotice = (c: { rawValue: number; rawUnit: string }, acted: 'confirmed' | 'rejected') =>
  `Our team corrected this reading after you ${acted} it: ${formatActivity(c.rawValue)} ${c.rawUnit}. Review it.`

/** Q12 (ruled 10 Oct 2026): a figure waiting on the team can be entered by the customer, as a T10 override. */
export const ENTER_MYSELF = 'Enter the figure myself instead'
export const ENTER_MYSELF_REASON_PLACEHOLDER = 'Why are you entering this figure instead of waiting for our team?'
