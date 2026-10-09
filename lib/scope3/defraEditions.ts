// T3e (R18): the DEFRA business travel and waste editions Scope 3 prices on, selected by the engine for the bound
// inventory's window with the DESNZ rule, like every other DESNZ dataset. Mirrors cat3Editions.ts, and for the same
// reason a separate module: the travel and waste readers import nothing from lib/ghg; the Scope 3 page already loads
// the engine, so the selection is made here and passed in.

import { editionFor, MissingEditionError, type Sel } from '../ghg/engine'
import type { DefraEdition, TravelWasteEditions } from './defraEditionTypes'

/**
 * The engine's sentence without its export clause. A Scope 3 line that is not counted leaves its category out of the
 * total, which the page and the export mark as partial and name; Scope 3 has no export gate (T3e report), so the
 * clause would be false here, as it is for Category 3.
 */
export const withoutExportClause = (s: string): string => s.replace(/ Export is blocked until they are loaded\.$/, '')

function pick(dataset: 'desnz_travel' | 'desnz_waste', sel: Sel): DefraEdition {
  try {
    const u = editionFor(dataset, sel)
    return { held: { label: u.label, rule: u.rule, basis: u.basis, published: u.published, corrected: u.corrected,
      provisional: u.provisional, year: u.key as number } }
  } catch (e) {
    if (!(e instanceof MissingEditionError)) throw e
    return { missing: { edition: e.edition, message: withoutExportClause(e.basis) } }
  }
}

/** The DEFRA travel and waste editions for `sel`, or why each is missing. */
export function travelWasteEditionsFor(sel: Sel): TravelWasteEditions {
  return { travel: pick('desnz_travel', sel), waste: pick('desnz_waste', sel) }
}
