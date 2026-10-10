// lib/ghg/editionWords.ts
//
// The factor-edition record's keys (ghg_inventories.factor_editions: jurisdiction, then factor family) in words, for
// every surface that prints them: the results email and the verifier page's Emission Factor Editions table. Pure.

export const JURISDICTION_WORDS: Record<string, string> = {
  US: 'United States', CA: 'Canada', UK: 'United Kingdom', EU: 'European Union', AU: 'Australia', NZ: 'New Zealand',
}
export const FAMILY_WORDS: Record<string, string> = {
  combustion: 'Fuel combustion', electricity: 'Electricity', steam: 'Steam', mobile: 'Vehicle fuel',
}

/** A jurisdiction key in words; the key itself when it has none, never blank. */
export const jurisdictionWords = (j: string): string => JURISDICTION_WORDS[j] ?? j
/** A factor family key in words; the key itself when it has none, never blank. */
export const familyWords = (f: string): string => FAMILY_WORDS[f] ?? f
