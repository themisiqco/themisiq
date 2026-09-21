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

/**
 * The Results table when it has no rows, in its two forms.
 *
 * ⚠️ "No data entered yet" WAS UNTRUE OF A WHOLE STATE. With Category 3 the only relevant category and
 * its activity D question answered yes, the table is empty because the figure is deliberately left out
 * of the total, not because nothing was entered: the data exists, it is priced, and the amber box
 * directly above the table lists the category and the reason. The message sent the customer back to
 * step 3 to enter data that was already there.
 *
 * ⚠️ AND IT IS NOT A CATEGORY 3 MESSAGE. Every unpriced-but-claimed state lands here the same way: a
 * Category 1 spend the factor route could not price, a Category 15 assessment that failed, a Category 3
 * inventory that cannot be read or whose streams are unanswered. The second form is keyed on there
 * being unpriced categories at all, so it covers each of them.
 */
/**
 * ⚠️ IT SAYS WHY THE TABLE IS EMPTY AND NOTHING ABOUT WHETHER THE RECORD IS COMPLETE. A draft ended
 * "The data is there; nothing is missing from Step 3", which is true of a category withheld for
 * activity D and false of several others that reach this same state: Category 3 withheld because
 * streams are unanswered IS missing answers, an unreadable bound inventory IS missing readable
 * workings, and a Category 1 spend that did not price may be incomplete. The reasons above the table
 * say which of those it is, per category; this line must not summarise them into a claim.
 */
export const RESULTS_TABLE_EMPTY = 'No data entered yet. Go back to Step 3 to enter your data.'
export const resultsTableAllUnpriced = (n: number): string =>
  `${n === 1 ? 'The one category' : `All ${n} categories`} you marked relevant ` +
  `${n === 1 ? 'is' : 'are'} left out of the total, for the ${n === 1 ? 'reason' : 'reasons'} given above.`
