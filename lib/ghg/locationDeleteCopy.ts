// ── EVERY SENTENCE THE LOCATION DELETE SAYS ──────────────────────────────────────────────────────
//
// Two moments, and they are not the same kind of message. The confirmation is asked BEFORE anything
// happens and has to let a customer weigh it. The failure is reported AFTER the irreversible half
// has already happened and has to say exactly what state the record is now in.
//
// CONSTRAINTS, the same ones countryRefusalCopy holds:
//   no em dashes; straight apostrophes; a location name is reproduced exactly as entered and never
//   starts a sentence; steps and controls are named as the wizard labels them, never numbered.

import { STREAM_META, DECLARABLE_STREAMS, streamState, type DeclarableStream, type Location } from './engine'

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

/**
 * What a location holds, read from the location itself.
 *
 * ⚠️ PURE AND EXPORTED, AND IT WAS NOT BEFORE. It lived in the page as a closure over `inventory`,
 * so the only way to exercise the copy was to hand-build a facts object, and a hand-built object can
 * describe a location the product cannot produce. That is exactly what happened: every fixture had
 * either everything or nothing, and the commonest real shape, a location carrying nine attestations
 * and no figures at all, was never once passed through. Building the facts from a real Location is
 * what makes the tests answer a question about the product rather than about the parameter list.
 *
 * Streams are read through streamState, the engine's own answer to "does this carry a figure", so
 * there is no second opinion about what counts as entered data.
 */
export function locationDeleteFacts(
  loc: Location,
  coverageResolutions: readonly { locId?: string }[] = [],
): LocationDeleteFacts {
  return {
    name: loc.name ?? '',
    documents: (loc.source_docs ?? []).length,
    streamsWithFigures: DECLARABLE_STREAMS.filter(stream => streamState(loc, stream) === 'quantified'),
    attestations: (loc.stream_attestations ?? []).length,
    coverageResolutions: coverageResolutions.filter(r => r.locId === loc.id).length,
  }
}

/** "a, b and c". Two items take "and", never a comma. Used for the stream enumeration. */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The holdings list, which contains one item that is itself a list.
 *
 * ⚠️ THE STREAM ENUMERATION GOES LAST AND TAKES A SERIAL COMMA IN FRONT OF IT. A fully populated
 * location read "...purchased electricity and purchased steam or district heating and 2 coverage
 * resolutions", where nothing tells the reader which "and" closes the streams and which closes the
 * holdings. With three holdings it is worse than untidy: "figures for natural gas and 2 coverage
 * resolutions" reads as figures for both.
 *
 * ⚠️ TWO THINGS THAT LOOK LIKE THE FIX AND ARE NOT, both tried first.
 * Adding the comma inside `list` put a second serial comma in the STREAM list as well, so the nine
 * stream case gained two of them and the boundary was no clearer. Adding it whenever any item
 * contains "and" put one into a plain pair, giving "1 uploaded document, and figures for natural gas
 * and purchased electricity", which is the stilted form a two item list should never take.
 * Putting the open ended list LAST is what actually fixes it: nothing follows the enumeration, so
 * there is no second boundary to mistake, and the serial comma is then needed only for three or more.
 */
function holdingsList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  const serial = items.length >= 3
  return `${items.slice(0, -1).join(', ')}${serial ? ',' : ''} and ${items[items.length - 1]}`
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
  const head = `Remove ${nameClause(f.name)}?`

  // ⚠️ AN ATTESTATION IS NOT CONTENT, AND COUNTING IT AS CONTENT PRODUCED A FALSE SENTENCE.
  // A location with nothing on it but nine attestations read "It has 9 stream attestations. All of
  // it goes, and its emissions leave every total", which said a site with no figures had emissions.
  // An attestation is an ANSWER: the customer ticked "This location has no natural gas", or clicked
  // "Attest all remaining as absent" once and wrote all nine. Nothing about it produces a figure,
  // and it is the one thing here that can be recreated, by answering again. So it never joins the
  // list of what goes; it gets its own clause, and it never carries "cannot be undone".
  // Documents, then coverage resolutions, then the streams. The stream clause is the only open ended
  // one, so it goes last and nothing runs into it.
  const holdings: string[] = []
  if (f.documents > 0) holdings.push(plural(f.documents, 'uploaded document', 'uploaded documents'))
  if (f.coverageResolutions > 0) {
    holdings.push(plural(f.coverageResolutions, 'coverage resolution', 'coverage resolutions'))
  }
  if (f.streamsWithFigures.length > 0) {
    holdings.push(`figures for ${list(f.streamsWithFigures.map(s => STREAM_META[s].name))}`)
  }

  // ⚠️ EVERY CONSEQUENCE IS DERIVED FROM WHAT IS ACTUALLY THERE. "Its emissions leave every total"
  // was fixed text, and it is false of a location that has no figures: it has no emissions. Each
  // clause below appears only when the thing it describes exists.
  const consequences: string[] = []
  if (f.streamsWithFigures.length > 0) consequences.push('its emissions leave every total')
  if (f.documents > 0) consequences.push('the uploaded documents are deleted from storage straight away')

  // ⚠️ THE ATTESTATION CLAUSE APPEARS ONLY WHERE ATTESTATIONS ARE ALL THERE IS. On a location that
  // also holds documents and figures it arrived AFTER "This cannot be undone", so the last thing read
  // before deciding was the one item that can be recreated, beside files being destroyed. It is
  // built here and used only in the branch below where nothing else is held.
  const attested = f.attestations > 0
    ? ` Its ${plural(f.attestations, 'stream', 'streams')} attested as absent would need attesting again.`
    : ''

  if (holdings.length === 0) {
    // Nothing that produces a figure, so no total moves. Said plainly, because the customer is
    // about to remove a row they may believe is load bearing.
    return `${head} It holds no figures and no documents, so no total changes.${attested}`
  }

  const sentence = consequences.length > 0
    ? ` ${capitalise(list(consequences))}. This cannot be undone.`
    : ' This cannot be undone.'
  return `${head} It has ${holdingsList(holdings)}.${sentence}`
}

const capitalise = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

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
