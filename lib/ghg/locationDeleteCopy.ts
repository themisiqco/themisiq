// ── EVERY SENTENCE THE LOCATION DELETE SAYS ──────────────────────────────────────────────────────
//
// Two moments, and they are not the same kind of message. The confirmation is asked BEFORE anything
// happens and has to let a customer weigh it. The failure is reported AFTER the irreversible half
// has already happened and has to say exactly what state the record is now in.
//
// CONSTRAINTS, the same ones countryRefusalCopy holds:
//   no em dashes; straight apostrophes; a location name is reproduced exactly as entered and never
//   starts a sentence; steps and controls are named as the wizard labels them, never numbered.

import { STREAM_META, type DeclarableStream } from './engine'

/** What a location holds, counted from the location itself. Never estimated, never hardcoded. */
export interface LocationDeleteFacts {
  /** Exactly as entered. Empty when the customer has not named it. */
  name: string
  /** Documents uploaded against this location, whose FILES are deleted from storage. */
  documents: number
  /** The streams carrying a figure, in the engine's own order. */
  streamsWithFigures: readonly DeclarableStream[]
  /** Absence attestations recorded on this location. */
  attestations: number
  /** Coverage resolutions in the inventory that are keyed to this location. */
  coverageResolutions: number
}

/** "a, b and c". Two items take "and", never a comma. */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * ⚠️ AN UNNAMED LOCATION IS DESCRIBED, NOT INVENTED. A row the customer never named would otherwise
 * read "Remove the location ?", and filling in "Location 2" would name something that is not on
 * their screen. The wizard shows the placeholder, so the sentence says what they can see.
 */
const nameClause = (name: string): string =>
  name.trim() ? `the location ${name.trim()}` : 'this unnamed location'

/**
 * The confirmation, naming what goes.
 *
 * ⚠️ ONE PARAGRAPH, WITH NO BLANK LINE AND NOTHING THAT DEPENDS ON A LINE BREAK. It is delivered
 * through window.confirm, which is the pattern the CBAM setup step and the SBTi page already use.
 * A native dialog gives no control over layout, so a sentence written around a break would arrive
 * as a run of text with its structure missing. Every sentence here stands on its own punctuation.
 *
 * ⚠️ COUNTS, NOT AN ADJECTIVE. "Are you sure?" cannot be weighed and "3 uploaded documents" can. A
 * clause whose count is zero is left out rather than printed as "0 documents", because a list of
 * zeroes reads as a form rather than as a description of this location.
 */
export function locationDeleteConfirmation(f: LocationDeleteFacts): string {
  const parts: string[] = []
  if (f.documents > 0) parts.push(plural(f.documents, 'uploaded document', 'uploaded documents'))
  if (f.streamsWithFigures.length > 0) {
    parts.push(`figures for ${list(f.streamsWithFigures.map(s => STREAM_META[s].name))}`)
  }
  if (f.attestations > 0) parts.push(plural(f.attestations, 'stream attestation', 'stream attestations'))
  if (f.coverageResolutions > 0) {
    parts.push(plural(f.coverageResolutions, 'coverage resolution', 'coverage resolutions'))
  }

  const head = `Remove ${nameClause(f.name)}?`

  // ⚠️ NOTHING OF VALUE GOES, SO NOTHING IS WARNED ABOUT. "This cannot be undone" on an empty row
  // is a warning about nothing, and a warning that appears every time stops being read by the time
  // it appears on a row that does hold three years of bills.
  if (parts.length === 0) return `${head} It holds no figures and no documents.`

  // ⚠️ "straight away" IS THE HONEST PART OF THIS SENTENCE. The files go the moment this is
  // confirmed; the row itself leaves the saved record only when the save that follows succeeds.
  // A customer should know which half is immediate, because that is the half that cannot be undone.
  const immediate = f.documents > 0
    ? ' All of it goes, its emissions leave every total, and the uploaded documents are deleted from storage straight away.'
    : ' All of it goes, and its emissions leave every total.'
  return `${head} It has ${list(parts)}.${immediate} This cannot be undone.`
}

/**
 * The save failed after the delete succeeded.
 *
 * ⚠️ THIS IS NOT A SAVE ERROR AND MUST NOT READ AS ONE. By the time it appears the files are gone
 * from storage and the stored inventory still holds both the location and the documents, so the
 * screen, the record and the bucket are three different accounts of one location. A generic "save
 * failed, try again" would leave the customer thinking nothing had happened.
 *
 * ⚠️ AND SAVING COMPLETES THE REMOVAL, IT DOES NOT REPAIR ANYTHING. An earlier version said "use
 * Save draft to bring the record into line", which describes putting something back. Nothing is
 * being put back: the documents are already destroyed, and the only thing a save can still do is
 * finish taking the location out of the stored inventory as well. Saying "bring into line" invites
 * a customer to expect the documents to return.
 */
export function locationDeleteSaveFailed(f: LocationDeleteFacts, reported: string): string {
  const opener = nameClause(f.name).replace(/^the /, 'The ').replace(/^this /, 'This ')
  const docs = f.documents > 0
    ? `, and its ${plural(f.documents, 'uploaded document was', 'uploaded documents were')} deleted from storage and cannot be restored`
    : ''
  const lists = f.documents > 0
    ? ` and still lists ${f.documents === 1 ? 'that document' : 'those documents'}`
    : ''
  return (
    `${opener} was removed here${docs}. The save failed, so the stored inventory still holds this ` +
    `location${lists}. Save again and it will be removed there too.` +
    (reported.trim() ? ` The save reported: ${reported.trim()}` : '')
  )
}

/**
 * The storage delete failed, so nothing at all was removed.
 *
 * ⚠️ THE ONE FAILURE WHERE THE ANSWER IS "NOTHING HAPPENED", and saying so is the whole message.
 * The handler deletes files first precisely so this case leaves the location listed with its
 * documents attached, exactly as it was. Same contract removeDoc already keeps for a single
 * document: a customer is never told something is gone while it is still there.
 */
export function locationDeleteStorageFailed(f: LocationDeleteFacts, reported: string): string {
  return (
    `${nameClause(f.name).replace(/^the /, 'The ')} was not removed. Its uploaded ` +
    `${f.documents === 1 ? 'document' : 'documents'} could not be deleted from storage, so nothing ` +
    `was changed and the location is still here with everything it held. Try again.` +
    (reported.trim() ? ` Storage reported: ${reported.trim()}` : '')
  )
}
