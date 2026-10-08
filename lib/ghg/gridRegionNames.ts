// lib/ghg/gridRegionNames.ts
//
// GRID AND RESIDUAL-MIX REGION NAMES, FOR SENTENCES A CUSTOMER READS (LEAD1 L5 amendment, Oct 2026). The engine keys
// its grid table (GRID_EF) and its residual-mix tables by code: US_AVG, US_CA, ON, EU_DE, AU_NSW, NZ, and eGRID
// subregions such as CAMX. The results email names a region in words and never prints one of those codes.
//
// ⚠️ THERE WAS NO SUCH MAP BEFORE THIS FILE. lib/emissionFactors/regionNames.ts names EXIOBASE spend regions for
// Scope 3, which are a different set of codes, and the wizard's step 2 shows the grid code itself. The eGRID subregion
// names are the wizard's own (US_SUBREGIONS in lib/ghg/engine.ts, after its code); everything else is a plain place
// name. What each average is comes from the comment on GRID_EF: US_AVG is the eGRID2023 US figure, EU_AVG the EEA
// EU-27 aggregate, AU_AVG the DCCEEW national figure; AU WA and NT are the SWIS and DKIS grids.
//
// lib/ghg/gridRegionNames.test.ts holds every key of GRID_EF and every residual region to a name, so a region added
// to the engine without one fails a test rather than reaching an email as a code.

import { US_SUBREGIONS } from './engine'
import { COUNTRY_WORDS } from './series'
import { GRID_REGION_CA, GRID_REGION_US, GRID_REGION_AU, GRID_REGION_AVERAGES } from './gridRegionWords'

const CA = GRID_REGION_CA
const US = GRID_REGION_US
const AU = GRID_REGION_AU
const AVERAGES = GRID_REGION_AVERAGES

const country = (code: string): string | null => {
  const w = COUNTRY_WORDS[code]
  return w ? w.replace(/^the /, '') : null
}

/** The grid region that priced a site's location-based Scope 2, in words, or null for a code this file does not know. */
export function gridRegionName(code: string | null | undefined): string | null {
  if (!code) return null
  if (AVERAGES[code]) return AVERAGES[code]
  if (CA[code]) return CA[code]
  if (code.startsWith('US_')) return US[code.slice(3)] ?? null
  if (code.startsWith('AU_')) return AU[code.slice(3)] ?? null
  if (code.startsWith('EU_')) return country(code.slice(3))
  return null
}

/**
 * A grid region as wizard step 2 shows it (LEAD1 L10): the readable name with the engine's code in brackets, so a
 * customer reads "Ontario" and a verifier still sees "ON", the key the workings and the CSV carry. An unknown code is
 * shown as itself.
 */
export function gridRegionDisplay(code: string | null | undefined): string {
  if (!code) return ''
  const name = gridRegionName(code)
  return name ? `${name} (${code})` : code
}

const SUBREGIONS = new Map(US_SUBREGIONS.map(([code, label]) => [code, label.replace(/^[A-Z]+\s*—\s*/, '')]))

/** The residual-mix region the engine applied (an eGRID subregion, an EU member state, or Australia), in words. */
export function residualRegionName(code: string | null | undefined): string | null {
  if (!code) return null
  if (code === 'AU') return 'Australia'
  if (code.startsWith('EU_')) return country(code.slice(3))
  return SUBREGIONS.get(code) ?? null
}
