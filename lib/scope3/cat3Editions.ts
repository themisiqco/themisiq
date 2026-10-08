// T3c (R18): the two editions Category 3 energy is priced on, selected by the engine for the bound inventory's window.
//
// ⚠️ A SEPARATE MODULE ON PURPOSE. cat3Energy.ts imports nothing from lib/ghg (C3-11, C3I-12): the engine carries every
// factor table in the product. The Scope 3 page already loads the engine, so the selection is made here and passed in.
//
// Category 3 takes the rule of the GHG factor beside it: DESNZ for DEFRA well-to-tank and T&D, NGA activity years for
// Australia's NGA Scope 3.

import { editionFor, MissingEditionError, type Sel } from '../ghg/engine'
import type { Cat3Edition, Cat3Editions } from './cat3Energy'

function pick(dataset: 'desnz_scope3_energy' | 'nga_scope3', sel: Sel): Cat3Edition {
  try {
    const u = editionFor(dataset, sel)
    return { held: { label: u.label, rule: u.rule, basis: u.basis, provisional: u.provisional } }
  } catch (e) {
    if (!(e instanceof MissingEditionError)) throw e
    return { missing: { edition: e.edition, sentence: site => e.forSite(site) } }
  }
}

/** The DEFRA and NGA Scope 3 editions for `sel`, or why each is missing. */
export function cat3EditionsFor(sel: Sel): Cat3Editions {
  return { defra: pick('desnz_scope3_energy', sel), nga: pick('nga_scope3', sel) }
}
