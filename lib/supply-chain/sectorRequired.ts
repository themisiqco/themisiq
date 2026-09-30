// lib/supply-chain/sectorRequired.ts
// A supplier's sector must be one of EXIOBASE's industry codes before a register can be saved.
//
// WHY THIS EXISTS (30 Sep 2026). The database rejects a register whose suppliers array holds any
// sector that is not an EXIOBASE industry code: assert_sector_codes_exist(), BEFORE INSERT OR UPDATE
// on supply_chain_registers, raises PT422 and the whole save fails. The form used to start every new
// supplier on 'Professional Services', a name from the retired sector list and not a code. The select
// has no such option, so it SHOWED "Select sector" while the state held the retired name, and a
// supplier left untouched failed the save with a generic "try again" that named nothing.
//
// So a new supplier starts with NO sector, and the save is refused on the client first, in words
// that name the suppliers to fix. The trigger stays the enforcement; this only explains it earlier.

import { INDUSTRY_CODES } from '../emissionFactors/industryOptions'

/** What a new supplier's sector starts as: nothing chosen. Never a default industry. */
export const NEW_SUPPLIER_SECTOR = ''

/** True only for an EXIOBASE industry code, the same set the database trigger accepts. */
export const hasValidSector = (sector: unknown): boolean =>
  typeof sector === 'string' && INDUSTRY_CODES.has(sector)

/** The suppliers a save would be rejected for, named as the form names them. */
export const suppliersWithoutSector = (suppliers: readonly { name: string; sector: string }[]): string[] =>
  suppliers.flatMap((s, i) => (hasValidSector(s.sector) ? [] : [s.name.trim() || `Supplier ${i + 1}`]))

const NAMED = 5
/** The refusal shown beside the save button. `names` is suppliersWithoutSector()'s result, not empty. */
export const sectorRequiredMessage = (names: readonly string[]): string => {
  const shown = names.slice(0, NAMED).join(', ')
  const more = names.length > NAMED ? ` and ${names.length - NAMED} more` : ''
  return names.length === 1
    ? `Choose a sector for ${shown} before saving. A register cannot be saved while a supplier has no sector.`
    : `Choose a sector for these ${names.length} suppliers before saving: ${shown}${more}. A register cannot be saved while a supplier has no sector.`
}

/** Shown when the database still refuses (PT422), which the check above should make unreachable. */
export const SECTOR_REJECTED_MESSAGE =
  'This register was not saved: at least one supplier has a sector that is not in the sector list. Choose a sector for each supplier and save again.'
