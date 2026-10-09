// T3e (R18): the DEFRA travel and waste edition a Scope 3 line is priced on, as the engine selected it. Types only, so
// the factor readers (lib/emissionFactors/defraTravel.ts, defraWaste.ts) and the category pricing can name it without
// importing the engine. The selection itself is lib/scope3/defraEditions.ts.

/** The edition a line is priced on: its label, the rule that chose it and why, its dates, and its year. */
export interface DefraEditionCell {
  label: string
  rule: string
  basis: string
  /** "11 June 2026", or "on or before ..." (R20). */
  published: string
  /** The correction date the held values reflect, in words; null where they reflect the original publication. */
  corrected: string | null
  provisional: boolean
  /** The edition year: the DEFRA artefact the line reads (defraTravelFor / wasteRecord). */
  year: number
}

/** One DESNZ dataset's edition for the window, or why it is missing. A missing edition is an unpriced line. */
export type DefraEdition =
  | { held: DefraEditionCell }
  | { missing: { edition: string; message: string } }

/** The two datasets T3e wires: business travel (Categories 6 and 7) and waste disposal (Categories 5 and 12). */
export interface TravelWasteEditions { travel: DefraEdition; waste: DefraEdition }

/** The held editions in words, "2023, 2024, 2025 or 2026": for a sentence with no reporting window bound (the
 *  methodology page, the assistant), which names the set held rather than one edition (T3e, as T3d did for energy). */
export const heldYearsWords = (years: readonly number[]): string =>
  years.length < 2 ? years.join('') : `${years.slice(0, -1).join(', ')} or ${years[years.length - 1]}`

/** The DEFRA/DESNZ publication, named for the set held: "UK DEFRA/DESNZ GHG Conversion Factors for Company Reporting
 *  (full set, Waste disposal sheet, AR5 GWPs), the edition the reporting year requires (2023, 2024, 2025 or 2026)". */
export const defraHeldSource = (years: readonly number[], detail: string): string =>
  `UK DEFRA/DESNZ GHG Conversion Factors for Company Reporting (${detail}), the edition the reporting year requires (${heldYearsWords(years)})`

/** The sentence a priced Category 5, 6, 7 or 12 record carries about its edition: which one, the rule's basis, and its
 *  publication and correction dates, as a GHG workings row does (T3e). */
export function defraEditionSentence(e: DefraEditionCell): string {
  // The engine's basis already says "Values as corrected on ..." where a correction applies; it is not said twice.
  const correction = e.corrected && !e.basis.includes(`corrected on ${e.corrected}`) ? `; values as corrected on ${e.corrected}` : ''
  const dates = `Published ${e.published}${correction}.`
  return `Factor edition: ${e.label}${e.provisional ? ' (provisional)' : ''}. ${e.basis} ${dates}`
}
