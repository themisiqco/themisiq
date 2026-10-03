// lib/ghg/unsavedChanges.ts
//
// WHETHER THE GHG WIZARD HOLDS WORK THAT IS NOT SAVED (T10c). Pure: no React, no storage.
//
// The page keeps a BASELINE: the fingerprint of the inventory as it was last loaded or saved. The page is
// dirty whenever the inventory differs from it. Every customer action that matters (an upload, a reading
// confirmed or rejected, a date or unit edit, a coverage resolution, a typed figure) changes the inventory,
// so it changes the fingerprint, and the warning before leaving and the Save draft nudge follow without each
// action having to remember to say so. A save records the fingerprint of what it SAVED, so an edit made while
// the save was in flight still reads as unsaved.
//
// A null baseline means "nothing saved yet that this matches", for a draft restored from the browser.

/** The fingerprint of an inventory: its full serialised state. */
export function inventoryFingerprint(inventory: unknown): string {
  return JSON.stringify(inventory)
}

/** True when the inventory holds changes since the baseline was taken. */
export function hasUnsavedChanges(baseline: string | null, inventory: unknown): boolean {
  return baseline === null || inventoryFingerprint(inventory) !== baseline
}

/** The nudge with Save draft (T10c ruling): on every step of the wizard whenever the page is dirty. */
export function showUnsavedNudge(a: { mode: string; dirty: boolean }): boolean {
  return a.mode === 'wizard' && a.dirty
}
