// lib/testing/heldSelection.ts
//
// T3c diff 2: a selection context for tests that are about something OTHER than edition selection: the year at which
// every edition a location's country needs is held, so the test prices on today's tables the way it did before T3c.
// Prepared on a fixed date, so no test depends on the day it runs. Tests ABOUT selection build their own context.
//   US 2025 (EPA Hub 2025; eGRID2023 newest), CA 2023 (ECCC v3.0 2023 set; Table 5.3 data year 2023),
//   UK 2026 (DEFRA 2026), AU 2025 (NGA 2025), NZ 2026 (MfE 2026 v2; grid and T&D rows to 2025), EU 2024 (AIB 2024).

import { selectionFor, canonicalCountryCode, EU_COUNTRIES, type Sel } from '../ghg/engine'
import { cat3EditionsFor } from '../scope3/cat3Editions'
import type { Cat3Editions } from '../scope3/cat3Energy'

export const TEST_PREPARED_ON = new Date(2026, 9, 8)   // 8 October 2026

export function heldYearFor(country: string | undefined): number {
  const c = canonicalCountryCode(country)
  if (c === 'CA') return 2023
  if (c === 'GB' || c === 'UK') return 2026
  if (c === 'NZ') return 2026
  if (c === 'AU') return 2025
  if (EU_COUNTRIES.includes(c)) return 2024
  return 2025
}

/** The held-year selection context for one location's country. */
export const heldSel = (loc: object): Sel => selectionFor(heldYearFor((loc as { country?: string }).country), 12, { preparedOn: TEST_PREPARED_ON })
/** A selection context for `year` (December year end unless given), prepared on the fixed test date. */
export const testSel = (year: number, fiscalYearEndMonth = 12): Sel => selectionFor(year, fiscalYearEndMonth, { preparedOn: TEST_PREPARED_ON })

/**
 * T3c (R18): Category 3's editions at the year ending June 2026, the window where both of its editions are held: DEFRA 2026
 * (the newest published by 30 June 2026, DESNZ's rule for July to June years) and NGA 2025 (activity year 2025-26).
 */
export const CAT3_EDS: Cat3Editions = cat3EditionsFor(testSel(2026, 6))
