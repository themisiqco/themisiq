// ── SHARED SCOPE 3 FORM COPY ─────────────────────────────────────────────────────────────────────
//
// Strings the Calculate step's inputs carry, where more than one panel carries the same one. The
// fifteen "Where to find it" texts live in lib/scope3/dataSources.ts; this is for the labels and
// placeholders beside the fields themselves.

/**
 * The known-emissions override placeholder, on the EXIOBASE panel (Cats 1, 2 and 4) and the generic
 * panel (Cats 3, 8, 9, 10, 11, 13 and 14).
 *
 * ⚠️ IT SAID "spend-based" UNTIL 20 SEP 2026, IN TWO SPELLINGS, AND IT CONTRADICTED THE TEXT ABOVE IT.
 * The EXIOBASE panel read "Leave blank to use the spend-based estimate" and the generic panel "Leave
 * blank to use spend-based". Categories 9, 10, 11, 13 and 14 are priced from the flat factor and the
 * company spends nothing in any of them: their own dataSource text now says there is no invoice of
 * theirs behind the figure, so a placeholder calling the estimate spend-based argued with the
 * paragraph directly above it. The longer spelling also truncated at the field's width.
 *
 * One constant, because two literals in two panels is how the two spellings arose in the first place.
 */
export const KNOWN_EMISSIONS_PLACEHOLDER = 'Leave blank to use the estimate'
