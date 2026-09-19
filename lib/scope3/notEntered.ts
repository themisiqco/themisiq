// ── "NOT ESTIMATED, BECAUSE … HAS NOT BEEN ENTERED", ONE FORM FOR EVERY CATEGORY ─────────────────────
//
// The sentence the Results amber box, the panel and the export show for a relevant category whose inputs
// are not there yet. It was written inline for Cats 1, 2 and 4 (unpricedReason in the Scope 3 page); Cat 15
// now uses it too, so the two cannot drift into different forms.
//
// It names what is MISSING, in the words of the controls the customer is looking at. It does not guess at
// why, and it is never used where something was entered and still could not be priced.

export function notEnteredReason(missing: readonly string[]): string {
  return `Not estimated, because ${missing.length === 1 ? 'this has' : 'these have'} not been entered: ${missing.join(', ')}.`
}
