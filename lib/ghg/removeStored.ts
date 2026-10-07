// lib/ghg/removeStored.ts
//
// RM1: removing stored files from the source-documents bucket, without reporting a failure for something an earlier
// call has just removed. Pure: the storage call, the current state and the row edit are passed in.
//
// THE DEFECT. Remove on an uploaded bill showed "That document couldn't be deleted. It is still attached to this
// location." with no document listed, and the file was gone from storage. Two removals of one document were in
// flight at once (a second click while the first awaited storage). The first deleted the object and dropped the row;
// the second asked storage to delete an object already gone, got an empty list, and removedAll(1, []) read that as a
// refusal. Its message then claimed a document was still attached that no longer was.
//
// TWO GUARDS, EACH FOR ITS OWN CASE:
//   - In flight. A second call for the same key while the first is running does nothing at all (the control is
//     disabled too, but a guard that lives only in the render is one refactor from gone).
//   - Already removed. When storage removes less than was asked, the CURRENT state decides what that means. If the
//     row is no longer listed, an earlier call removed it: there is nothing to report. Only a row that is still
//     listed is a refusal, and keeps the honest message.
//
// UNCHANGED: storage first, then the row; an error or a real refusal leaves the row exactly where it was and says so.

/** What storage.remove() returns, as much of it as is read here. */
export type StorageRemoveResult = { data: unknown[] | null; error: { message: string } | null }

export type RemoveOutcome =
  | 'removed'          // storage removed everything asked for; the row is dropped
  | 'already_removed'  // storage removed less, and the row is already gone: an earlier call removed it
  | 'refused'          // storage removed less, and the row is still listed: nothing changed, `fail` was told
  | 'error'            // storage returned an error: nothing changed, `fail` was told
  | 'in_flight'        // a removal for this key is already running: this call did nothing

export async function removeStored(a: {
  key: string                                  // the document id, or the location id
  inFlight: Set<string>                        // shared across calls; read and written synchronously
  paths: string[]
  remove: (paths: string[]) => Promise<StorageRemoveResult>
  stillListed: () => boolean                   // reads the state as it is NOW, after the await
  drop: () => void                             // removes the row(s); called only on 'removed'
  onError: (message: string) => void
  onRefused: (removedCount: number) => void
}): Promise<RemoveOutcome> {
  if (a.inFlight.has(a.key)) return 'in_flight'
  a.inFlight.add(a.key)
  try {
    const { data, error } = await a.remove(a.paths)
    if (error) { a.onError(error.message); return 'error' }
    const removedCount = data?.length ?? 0
    if (removedCount < a.paths.length) {
      // No error is not the same as deleted: a delete the storage policy refuses can come back empty. But an empty
      // result for a row that is already gone means an earlier call deleted it, and there is nothing to say.
      if (!a.stillListed()) return 'already_removed'
      a.onRefused(removedCount)
      return 'refused'
    }
    a.drop()
    return 'removed'
  } finally {
    a.inFlight.delete(a.key)
  }
}
