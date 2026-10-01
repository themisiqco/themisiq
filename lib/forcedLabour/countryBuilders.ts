// lib/forcedLabour/countryBuilders.ts
// The builders for countries other than Canada, by country key. Canada's builder is lib/s211 and its own
// routes (/api/s211); every other country goes through /api/forced-labour/reports/[id]/countries/[country].
// A country is here only once its builder exists: the UK since Stage D1 (1 Oct 2026).

import { UK_SECTIONS, isUkSectionKey, type UkSectionDef } from './uk/builderContent'
import { cleanUkApplicability } from './uk/applicability'
import type { CountryKey } from './countries'

export type CountryBuilder = {
  sections: readonly UkSectionDef[]
  isSectionKey: (k: unknown) => boolean
  /** The applicability record as stored, or null when the body is not one. */
  cleanApplicability: (u: unknown) => Record<string, string> | null
}

export const COUNTRY_BUILDERS: Partial<Record<CountryKey, CountryBuilder>> = {
  uk: { sections: UK_SECTIONS, isSectionKey: isUkSectionKey, cleanApplicability: u => cleanUkApplicability(u) as Record<string, string> | null },
}

export const builderFor = (country: string): CountryBuilder | undefined => COUNTRY_BUILDERS[country as CountryKey]
