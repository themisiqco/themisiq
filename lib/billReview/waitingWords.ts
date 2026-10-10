// lib/billReview/waitingWords.ts
//
// BR4: what the customer reads about a bill with the Bill Review team. Plain language, no em dash. Dates in words
// (T10c). One copy each, for the document list and the figure.

import { isoDateInWords } from '../ghg/dateWords'

/** A waiting bill, and a figure waiting on one: the expected date, or that it is not set. Never a guessed date. */
export function withTeamLine(expectedBy: string | null | undefined): string {
  return expectedBy ? `With our team, expected by ${isoDateInWords(expectedBy)}.` : 'With our team. The expected date is not set yet.'
}

/** The submission did not land. The page sends it again the next time the inventory is opened. */
export const SUBMIT_FAILED_NOTE = 'Not yet sent to our team: the request did not complete. It is sent again the next time this inventory is opened. It is not sent to the AI.'

/** A specialist found no figure they could read. */
export const unreadableNote = (note: string | null | undefined) =>
  `Our team could not read a figure from this bill${note ? `: ${note.replace(/[.\s]+$/, '')}` : ''}. Type it into the box above.`

/** A correction that arrived after the customer acted on the reading it corrects. Not merged (BR4 ruling 5). */
export const correctionNotice = (c: { rawValue: number; rawUnit: string }, acted: 'confirmed' | 'rejected') =>
  `Our team corrected this reading after you ${acted} it: ${c.rawValue} ${c.rawUnit}. Review it.`

/** Q12 (ruled 10 Oct 2026): a figure waiting on the team can be entered by the customer, as a T10 override. */
export const ENTER_MYSELF = 'Enter the figure myself instead'
export const ENTER_MYSELF_REASON_PLACEHOLDER = 'Why are you entering this figure instead of waiting for our team?'
