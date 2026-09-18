// ── ADD / UPDATE / REMOVE ON A LIST OF ROWS, APPLIED TO THE LIST AS IT IS NOW ─────────────────────
//
// ONE implementation of the row edits an inline row editor makes, for use INSIDE a state updater:
//
//   setCatData(prev => ({ ...prev, cat5: { ...prev.cat5, wasteRows: editRows(prev.cat5?.wasteRows, op) } }))
//
// ⚠️ WHY IT TAKES THE CURRENT LIST AND NOT THE RENDERED ONE. The Scope 3 page's Cat 5 and Cat 15 helpers
// used to read the list from the render (catData, not prev), build the next list from that, and hand the
// result to setCatData. Two edits in one tick then both started from the same rendered list, and the
// second write replaced the first: one edit was lost with no sign it had happened. Applied to the list
// the updater receives, each edit starts from the one before it.
//
// ⚠️ ROWS ARE ADDRESSED BY id, NOT BY POSITION. A position is only meaningful against the list it was
// read from. Two removals queued in one tick against positions 1 and 2 of the rendered list would, applied
// in turn, remove rows 1 and 3. An id names the same row whatever has happened to the list before it.
//
// What this does NOT hold is anything row-specific: which fields a change clears, how a nested object is
// merged. A caller expresses that as an update whose patch is a function of the row as it is now.

export interface Row {
  id: string
}

export type RowEdit<T extends Row> =
  | { kind: 'add'; row: T }
  | { kind: 'remove'; id: string }
  /** `patch` may be a function of the row as it is when the edit is applied, for a change that depends on
   *  the row's other fields. An id not in the list changes nothing. */
  | { kind: 'update'; id: string; patch: Partial<T> | ((row: T) => Partial<T>) }

/** The list after one edit. Never mutates `rows`; `undefined` is an empty list. */
export function editRows<T extends Row>(rows: readonly T[] | undefined, edit: RowEdit<T>): T[] {
  const current = rows ?? []
  switch (edit.kind) {
    case 'add':
      return [...current, edit.row]
    case 'remove':
      return current.filter(r => r.id !== edit.id)
    case 'update':
      return current.map(r => {
        if (r.id !== edit.id) return r
        const patch = typeof edit.patch === 'function' ? edit.patch(r) : edit.patch
        return { ...r, ...patch }
      })
  }
}
