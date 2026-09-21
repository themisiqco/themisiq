// ── THE TWO MODULES, LINKED IN BOTH DIRECTIONS ───────────────────────────────────────────────────
//
// A Scope 3 record belongs to exactly one GHG inventory (`unique (inventory_id)` on
// scope3_inventories), and Category 3 is calculated from that inventory's own energy. Until now the
// two were reachable from each other only through the dashboard: the Scope 3 page said "change the
// energy in that inventory" with no way to get there, and the GHG page offered Scope 3 only from its
// Export step, without knowing whether a record already existed.
//
// ⚠️ ONE MODULE FOR BOTH DIRECTIONS, BECAUSE THE TWO PAGES MUST AGREE ON THE URLS AND ON WHAT THEY SAY
// WHEN AN ID DOES NOT OPEN. Everything here is pure: the hrefs, the step names and the sentences. The
// pages render; nothing in here reads the database or the DOM.

// ── THE GHG WIZARD'S STEPS, BY NAME ──────────────────────────────────────────────────────────────
//
// ⚠️ NAMES IN THE URL AND IN COPY, NEVER NUMBERS. "Go to step 2" rots the moment a step is inserted,
// and it is meaningless to a customer reading it in an export. The ORDER below is the page's own
// (app/dashboard/ghg/page.tsx STEPS), and moduleLinks.test.ts checks this list against it.

export type GhgStep = 'frameworks' | 'setup' | 'energy' | 'additional' | 'review' | 'export' | 'audit'

/** In the page's own order: the index of a name is the index of the step it opens. */
export const GHG_STEP_ORDER: readonly GhgStep[] = [
  'frameworks', 'setup', 'energy', 'additional', 'review', 'export', 'audit',
]

/** The label the GHG wizard's own tab bar shows, so copy naming a step names it as the customer sees it. */
export const GHG_STEP_NAME: Readonly<Record<GhgStep, string>> = {
  frameworks: 'Reporting frameworks',
  setup: 'Company setup',
  energy: 'Energy & fuel data',
  additional: 'Additional data',
  review: 'Review & workings',
  export: 'Export reports',
  audit: 'Audit trail',
}

/**
 * The step index a `?step=` value opens, or null.
 *
 * ⚠️ AN UNKNOWN VALUE IS null, WHICH THE PAGE READS AS "OPEN AT THE FIRST STEP". A link written against
 * an older name, or a hand-edited URL, must not leave the wizard on a step nobody asked for.
 */
export const ghgStepIndex = (step: string | null | undefined): number | null => {
  const i = GHG_STEP_ORDER.indexOf((step ?? '') as GhgStep)
  return i === -1 ? null : i
}

/** A link into the GHG wizard, at a named step, for one inventory. */
export const ghgHref = (inventoryId: string, step: GhgStep): string =>
  `/dashboard/ghg?id=${encodeURIComponent(inventoryId)}&step=${step}`

/** A link into the Scope 3 calculator, bound to one inventory. `from=ghg` is what the picker reads. */
export const scope3Href = (inventoryId: string): string =>
  `/dashboard/scope3?inventoryId=${encodeURIComponent(inventoryId)}&from=ghg`

// ── WHEN AN ID IN THE URL DOES NOT OPEN ──────────────────────────────────────────────────────────
//
// ⚠️ THREE CAUSES, ONE OBSERVATION, AND THE SENTENCE STATES THE OBSERVATION. Row-level security makes
// "not yours", "never existed" and "deleted" indistinguishable: each returns no row. Naming one of
// them would be a diagnosis nobody made, which is the defect the August 2026 pop-up message taught
// (a cause printed on every successful click, for something that had never happened).
//
// ⚠️ AND THE ENDING IS PER PAGE, BECAUSE IT NAMES WHAT IS ACTUALLY THERE. The Scope 3 page falls back
// to its inventory picker; the GHG page has a list of saved inventories, or, for an account with none,
// a blank wizard. A shared ending would be false on at least one of them.

const NOT_OPENED_CORE =
  'That inventory could not be opened with this account. It may have been deleted, or it may belong ' +
  'to a different account. Nothing has been changed.'

/** For the Scope 3 picker gate, which lists the account's inventories below the message. */
export const INVENTORY_NOT_OPENED_SCOPE3 = `${NOT_OPENED_CORE} Pick an inventory below.`

/** For the GHG page, whose ending depends on whether this account has any saved inventory to offer. */
export const inventoryNotOpenedGhg = (hasInventories: boolean): string =>
  hasInventories
    ? `${NOT_OPENED_CORE} Your saved inventories are listed below; open one of them.`
    : `${NOT_OPENED_CORE} There are no saved inventories on this account yet, so this is a new one.`

// ── THE GHG PAGE'S "SCOPE 3 FOR THIS INVENTORY" CONTROL ──────────────────────────────────────────

export type Scope3LinkState =
  /** The inventory has never been saved, so there is nothing for a Scope 3 record to attach to. */
  | { kind: 'unsaved'; label: string; href: null; note: string }
  /** A Scope 3 record is already attached to this inventory. */
  | { kind: 'open'; label: string; href: string; note: string }
  /** No record yet: the link opens Scope 3 bound to this inventory, with nothing saved. */
  | { kind: 'start'; label: string; href: string; note: string }

/**
 * What the control says and where it goes.
 *
 * ⚠️ IT CANNOT CREATE A SECOND RECORD OR TOUCH ANOTHER INVENTORY'S. The href names THIS inventory, the
 * Scope 3 page loads its record by `inventory_id`, and its save upserts on that same column, which the
 * unique constraint backs. There is no path here that writes anything at all: this function returns a
 * label and a URL.
 */
export function scope3LinkState(inventoryId: string | null, hasRecord: boolean): Scope3LinkState {
  if (!inventoryId) {
    return {
      kind: 'unsaved',
      label: 'Scope 3 for this inventory',
      href: null,
      note: 'Save this inventory first. A Scope 3 record is attached to a saved inventory, so there is ' +
        'nothing to attach one to yet.',
    }
  }
  return hasRecord
    ? {
        kind: 'open',
        label: 'Open the Scope 3 record for this inventory',
        href: scope3Href(inventoryId),
        // ⚠️ "as last saved", NOT "where you left off". The Scope 3 page restores the SAVED record;
        // anything typed and not saved in an earlier session was never stored and does not come back.
        note: 'This inventory already has a Scope 3 record. Opening it shows it as last saved.',
      }
    : {
        kind: 'start',
        label: 'Start Scope 3 for this inventory',
        href: scope3Href(inventoryId),
        note: 'No Scope 3 record is attached to this inventory yet. Starting one binds it to this ' +
          'inventory; nothing is saved until you save it.',
      }
}
