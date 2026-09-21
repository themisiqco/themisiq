// ── WHAT A REFUSED SCOPE 3 SAVE SAYS TO THE CUSTOMER ─────────────────────────────────────────────
//
// ⚠️ A DATABASE MESSAGE REACHED A CUSTOMER, VERBATIM, AND THIS MODULE IS WHY IT CANNOT AGAIN. Saving a
// Scope 3 record with no company sector chosen wrote '' into a column whose check reads
// `sector is null or sector like 'i%'`, and app/dashboard/scope3/page.tsx alerted
// `'Save failed: ' + error.message` — so the customer read:
//
//   Save failed: new row for relation "scope3_inventories" violates check constraint
//   "scope3_inventories_sector_is_industry"
//
// which names a constraint, a relation and nothing they can act on. The write itself is fixed at its
// source (the page writes NULL, not ''); this module exists for every OTHER constraint on that table,
// including the ones added after today.
//
// ⚠️ EVERY SENTENCE SAYS NOTHING WAS SAVED, AND SAYS IT THE SAME WAY. The upsert is ONE statement: it
// writes the whole record or none of it, so a partial write is not a thing that can happen. A customer
// looking at a screen full of figures needs to be told that before anything else, and told that what is
// on screen is still there.
//
// ⚠️ THE FALLBACK NAMES NO CAUSE. Four instances in three days, 2 to 4 Aug 2026, ended with a message
// that guessed: "your browser blocked the pop-up" was printed on every successful click, for a cause
// that had never once occurred, while the real defect hid behind it for months. So the unknown branch
// states what was OBSERVED (the database refused it), carries the code so a report names something we
// can look up, and says the refusal is recorded; the raw message goes to the console, which is where it
// is useful. It names no support route, because the product has none to name.
//
// The names below are the live constraints on public.scope3_inventories, confirmed against the database
// on 20 Sep 2026 and matching supabase/migrations/20260908_scope3_inventories_definition.sql,
// 20260914_exiobase_sectors.sql and 20260916_scope3_country.sql. saveError.test.ts fails if a name here
// has no sentence, so a new constraint cannot ship without one.

/** The shape postgrest-js returns. Every field is optional: an error from a network layer has none. */
export interface SaveErrorLike {
  message?: string | null
  code?: string | null
  details?: string | null
  hint?: string | null
}

/**
 * The same closing clause on every sentence. One statement, so there is no half-saved state to warn
 * about and no "some categories were saved" to qualify.
 */
export const SAVE_NOTHING_LOST =
  'Nothing was saved, and nothing on this screen has been lost: the save writes the whole record or ' +
  'none of it.'

const WHERE_SECTOR = 'Open the Setup step and choose your primary sector, then save again.'

/**
 * For the failures a customer cannot act on.
 *
 * ⚠️ IT NAMES NO SUPPORT ROUTE, BECAUSE THE PRODUCT HAS NONE. Every one of these sentences used to end
 * "please send us this message" — an instruction with nowhere to send it, which is worse than saying
 * nothing: it makes the customer look for a route, find none, and read the whole message as careless.
 * What is TRUE is that the refusal is logged where we will see it, and that there is nothing on the
 * screen to put right.
 */
const NOT_YOURS_TO_FIX =
  'This is not something to put right on screen: the details of the refusal are recorded for us.'

/**
 * One sentence per constraint this table carries, by the name Postgres puts in the message.
 *
 * ⚠️ TWO WAYS FOR ONE COLUMN TO FAIL, AND THEY ARE DIFFERENT FAULTS. The check asks whether the sector
 * LOOKS like an industry code; the foreign key asks whether it EXISTS in the classification. A value
 * that is neither an industry nor a real code trips the check first, so the FK sentence is the one a
 * customer sees when a code was once real and is not any more: a retired classification row, or a
 * record carrying the vocabulary that preceded EXIOBASE.
 */
export const SCOPE3_SAVE_SENTENCES: Readonly<Record<string, string>> = {
  scope3_inventories_sector_is_industry:
    `The primary sector on this record is not one of the industries we recognise. ${SAVE_NOTHING_LOST} ${WHERE_SECTOR}`,
  scope3_inventories_sector_fkey:
    `The primary sector on this record is not in our industry classification. It may have been recorded ` +
    `before the classification changed. ${SAVE_NOTHING_LOST} ${WHERE_SECTOR}`,
  scope3_inventories_country_iso2_format:
    `The country of supply on this record is not a two-letter country code. ${SAVE_NOTHING_LOST} Open the ` +
    `Setup step and choose the country again, then save.`,
  scope3_inventories_status_check:
    `This record carries a status the platform does not use. ${SAVE_NOTHING_LOST} ${NOT_YOURS_TO_FIX}`,
  scope3_inventories_user_id_fkey:
    `This record is not attached to a signed-in account. ${SAVE_NOTHING_LOST} Sign in again and save.`,
  scope3_inventories_inventory_id_fkey:
    `The GHG inventory this Scope 3 record is bound to no longer exists. ${SAVE_NOTHING_LOST} It may have ` +
    `been deleted in the GHG module. Bind this record to an inventory that exists, then save.`,
  // ⚠️ THE CUSTOMER CAN ACT ON THIS ONE, so it does not get the not-yours-to-fix sentence. One GHG
  // inventory carries one Scope 3 record (scope3_inventories_inventory_unique), and the likely history
  // is a second Scope 3 record started against an inventory that already had one. Both ways out are
  // theirs to take.
  scope3_inventories_inventory_unique:
    `This GHG inventory already has a Scope 3 record, and each inventory carries one. ${SAVE_NOTHING_LOST} ` +
    `Either open the Scope 3 record already linked to that inventory and carry on there, or link this ` +
    `one to a different GHG inventory under "Which inventory is this Scope 3 for?" and save again.`,
  scope3_inventories_pkey:
    `This record's identifier is already in use. ${SAVE_NOTHING_LOST} ${NOT_YOURS_TO_FIX}`,
}

/**
 * Sentences for what the database says by CODE rather than by constraint name: the sector trigger, and
 * the classes of failure that carry no constraint name at all.
 */
export const SCOPE3_SAVE_CODE_SENTENCES: Readonly<Record<string, string>> = {
  // public.assert_sector_codes_exist(), 20260914_exiobase_sectors.sql. It validates sectors held INSIDE
  // cat_data, which no check constraint can do, and raises this SQLSTATE.
  PT422:
    `A sector recorded inside one of the categories is not one we recognise: the supplier sector on ` +
    `Category 1, or a portfolio sector carried by an older record on Category 15. ${SAVE_NOTHING_LOST} ` +
    `Open that category, choose the sector again, and save.`,
  // A NOT NULL column arrived empty. Every one of them is filled by the page, so this is ours, not theirs.
  '23502':
    `A field this record cannot be saved without arrived empty. ${SAVE_NOTHING_LOST} ${NOT_YOURS_TO_FIX}`,
  // char(2) on country_iso2 is the only length-limited column on the table.
  '22001':
    `A value on this record is longer than the column that holds it. ${SAVE_NOTHING_LOST} ${NOT_YOURS_TO_FIX}`,
  // Row-level security refused the write: the row's user_id is not the signed-in user, or the session
  // expired between loading the page and pressing Save.
  '42501':
    `This account is not allowed to write this record. ${SAVE_NOTHING_LOST} Your session may have ended ` +
    `while the page was open: sign in again and save.`,
}

/** The constraint name Postgres puts in a violation message, or null. */
export function constraintNameFrom(error: SaveErrorLike | null | undefined): string | null {
  const m = /constraint "([^"]+)"/.exec(error?.message ?? '')
  return m ? m[1] : null
}

/**
 * What the customer reads when a save is refused.
 *
 * ⚠️ NEVER error.message, AND NEVER A GUESS. An unrecognised failure says what was observed and carries
 * the code, so the next report names something we can look up; the raw message is logged, not shown.
 */
export function saveErrorText(error: SaveErrorLike | null | undefined): string {
  const name = constraintNameFrom(error)
  if (name && SCOPE3_SAVE_SENTENCES[name]) return SCOPE3_SAVE_SENTENCES[name]
  const code = (error?.code ?? '').trim()
  if (code && SCOPE3_SAVE_CODE_SENTENCES[code]) return SCOPE3_SAVE_CODE_SENTENCES[code]
  // ⚠️ NO CAUSE IS NAMED HERE. Not the browser, not the network, not a permission, and no "try again":
  // any of those would be a diagnosis nobody made.
  return `The database refused this save${code ? ` (${code})` : ''}. ${SAVE_NOTHING_LOST} ${NOT_YOURS_TO_FIX}`
}
